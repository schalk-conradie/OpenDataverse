use super::solutions::{get_solution_component_dependencies, SolutionDependencyReport};
use super::*;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PluginOptionSummary {
    value: i32,
    label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PluginEditableState {
    can_edit: bool,
    can_delete: bool,
    reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PluginAssemblySummary {
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
pub(super) struct PluginPackageSummary {
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
pub(super) struct PluginTypeSummary {
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
pub(super) struct PluginStepSummary {
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
pub(super) struct PluginStepImageSummary {
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
pub(super) struct PluginMessageSummary {
    id: String,
    name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PluginMessageFilterSummary {
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
pub(super) struct PluginServiceEndpointSummary {
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
pub(super) struct PluginSystemUserSummary {
    id: String,
    full_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    domain_name: Option<String>,
    is_disabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PluginRegistrationSnapshot {
    assemblies: Vec<PluginAssemblySummary>,
    packages: Vec<PluginPackageSummary>,
    types: Vec<PluginTypeSummary>,
    steps: Vec<PluginStepSummary>,
    images: Vec<PluginStepImageSummary>,
    messages: Vec<PluginMessageSummary>,
    endpoints: Vec<PluginServiceEndpointSummary>,
    users: Vec<PluginSystemUserSummary>,
    stage_options: Vec<PluginOptionSummary>,
    mode_options: Vec<PluginOptionSummary>,
    deployment_options: Vec<PluginOptionSummary>,
    isolation_mode_options: Vec<PluginOptionSummary>,
    source_type_options: Vec<PluginOptionSummary>,
    image_type_options: Vec<PluginOptionSummary>,
    endpoint_contract_options: Vec<PluginOptionSummary>,
    endpoint_auth_type_options: Vec<PluginOptionSummary>,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PluginDiscoveredType {
    full_name: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    namespace: Option<String>,
    kind: String,
    is_abstract: bool,
    is_public: bool,
    implements_i_plugin: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    base_type: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PluginAssemblyInspection {
    local_path: String,
    file_name: String,
    size_bytes: u64,
    file_hash: String,
    assembly_name: String,
    version: String,
    culture: String,
    public_key_token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    target_framework: Option<String>,
    strong_name_signed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    clr_metadata_version: Option<String>,
    discovered_types: Vec<PluginDiscoveredType>,
    warnings: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RegisterPluginAssemblyInput {
    local_path: String,
    name: String,
    version: String,
    culture: String,
    public_key_token: String,
    isolation_mode: i32,
    source_type: i32,
    #[serde(default)]
    description: Option<String>,
    type_names: Vec<String>,
    #[serde(default)]
    solution_unique_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UpdatePluginAssemblyInput {
    assembly_id: String,
    local_path: String,
    name: String,
    version: String,
    culture: String,
    public_key_token: String,
    isolation_mode: i32,
    source_type: i32,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    solution_unique_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreatePluginTypeInput {
    assembly_id: String,
    type_name: String,
    #[serde(default)]
    friendly_name: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    is_workflow_activity: bool,
    #[serde(default)]
    solution_unique_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RegisterPluginStepInput {
    #[serde(default)]
    step_id: Option<String>,
    handler_type: String,
    #[serde(default)]
    plugin_type_id: Option<String>,
    #[serde(default)]
    service_endpoint_id: Option<String>,
    message_id: String,
    #[serde(default)]
    message_filter_id: Option<String>,
    name: String,
    stage: i32,
    mode: i32,
    rank: i32,
    supported_deployment: i32,
    #[serde(default)]
    async_auto_delete: Option<bool>,
    #[serde(default)]
    filtering_attributes: Option<String>,
    #[serde(default)]
    configuration: Option<String>,
    #[serde(default)]
    secure_configuration: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    impersonating_user_id: Option<String>,
    enabled: bool,
    #[serde(default)]
    solution_unique_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RegisterPluginStepImageInput {
    #[serde(default)]
    image_id: Option<String>,
    step_id: String,
    name: String,
    entity_alias: String,
    image_type: i32,
    message_property_name: String,
    #[serde(default)]
    attributes: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    solution_unique_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RegisterPluginServiceEndpointInput {
    #[serde(default)]
    endpoint_id: Option<String>,
    name: String,
    contract: i32,
    auth_type: i32,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    namespace_address: Option<String>,
    #[serde(default)]
    message_format: Option<i32>,
    #[serde(default)]
    auth_value: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    solution_unique_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PluginComponentStateInput {
    component_kind: String,
    id: String,
    enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PluginExportInput {
    local_path: String,
    include_managed: bool,
    #[serde(default)]
    component_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PluginWriteResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    message: String,
}
pub(super) fn plugin_option(value: i32, label: &str) -> PluginOptionSummary {
    PluginOptionSummary {
        value,
        label: label.to_string(),
    }
}

pub(super) fn plugin_stage_label(value: i32) -> &'static str {
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

pub(super) fn plugin_mode_label(value: i32) -> &'static str {
    match value {
        0 => "Synchronous",
        1 => "Asynchronous",
        _ => "Unknown",
    }
}

pub(super) fn plugin_deployment_label(value: i32) -> &'static str {
    match value {
        0 => "Server Only",
        1 => "Outlook Only",
        2 => "Both",
        _ => "Unknown",
    }
}

pub(super) fn plugin_isolation_label(value: i32) -> &'static str {
    match value {
        1 => "None",
        2 => "Sandbox",
        _ => "Unknown",
    }
}

pub(super) fn plugin_source_type_label(value: i32) -> &'static str {
    match value {
        0 => "Database",
        1 => "Disk",
        2 => "Normal",
        _ => "Unknown",
    }
}

pub(super) fn plugin_image_type_label(value: i32) -> &'static str {
    match value {
        0 => "PreImage",
        1 => "PostImage",
        2 => "Both",
        _ => "Unknown",
    }
}

pub(super) fn plugin_endpoint_contract_label(value: i32) -> &'static str {
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

pub(super) fn plugin_endpoint_auth_type_label(value: i32) -> &'static str {
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

pub(super) fn plugin_message_format_label(value: i32) -> &'static str {
    match value {
        1 => "Binary XML",
        2 => "Json",
        3 => "Text XML",
        _ => "Unknown",
    }
}

pub(super) fn plugin_status_label(state_code: i32, status_code: i32) -> &'static str {
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

pub(super) fn plugin_editable_state(
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

pub(super) async fn plugin_snapshot_section<T, F>(
    label: &str,
    future: F,
) -> (Vec<T>, Option<String>)
where
    F: std::future::Future<Output = Result<Vec<T>, String>>,
{
    match tokio::time::timeout(Duration::from_secs(12), future).await {
        Ok(Ok(items)) => (items, None),
        Ok(Err(error)) => (
            Vec::new(),
            Some(format!("{label} could not be loaded: {error}")),
        ),
        Err(_) => (
            Vec::new(),
            Some(format!("{label} took too long to load and was skipped.")),
        ),
    }
}

pub(super) async fn add_registration_component_to_solution(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    solution_unique_name: Option<&str>,
    component_id: &str,
    component_type: i32,
) -> Result<(), String> {
    let Some(solution_unique_name) = solution_unique_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(());
    };
    let solution_unique_name = validate_logical_name(solution_unique_name)?;

    dataverse_json_request(
        app,
        environment,
        reqwest::Method::POST,
        "/AddSolutionComponent",
        &serde_json::json!({
          "ComponentId": component_id,
          "ComponentType": component_type,
          "SolutionUniqueName": solution_unique_name,
          "AddRequiredComponents": false,
          "DoNotIncludeSubcomponents": true
        }),
    )
    .await
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

pub(super) async fn assert_plugin_row_editable(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    path: &str,
    _display_keys: &[&str],
) -> Result<Value, String> {
    let value = dataverse_get_json_value(
        app,
        environment,
        path,
        &[("$select", "name,ismanaged,iscustomizable")],
    )
    .await?;
    let display_name = json_string(&value, "name").unwrap_or_else(|| path.to_string());
    reject_read_only_component(&value, &display_name)?;
    Ok(value)
}

pub(super) fn validate_plugin_type_name(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("Type name is required.".to_string());
    }

    if value.len() > 256 {
        return Err("Type name must be 256 characters or fewer.".to_string());
    }

    Ok(value.to_string())
}

pub(super) fn sanitize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(super) async fn create_plugin_type_records(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    assembly_id: &str,
    type_names: &[String],
    solution_unique_name: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut ids = Vec::new();

    for type_name in type_names {
        let type_name = validate_plugin_type_name(type_name)?;
        let friendly_name = type_name
            .rsplit('.')
            .next()
            .filter(|value| !value.is_empty())
            .unwrap_or(&type_name)
            .to_string();
        let payload = serde_json::json!({
          "name": type_name,
          "typename": type_name,
          "friendlyname": friendly_name,
          "isworkflowactivity": false,
          "pluginassemblyid@odata.bind": format!("/pluginassemblies({assembly_id})")
        });
        let (body, entity_id) = dataverse_post_json_with_headers(
            app,
            environment,
            "/plugintypes",
            &payload,
            &[("Prefer", "return=representation".to_string())],
        )
        .await?;
        let id = serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|value| json_string(&value, "plugintypeid"))
            .or_else(|| entity_id.as_deref().and_then(guid_from_entity_id));
        if let Some(id) = id {
            add_registration_component_to_solution(app, environment, solution_unique_name, &id, 90)
                .await?;
            ids.push(id);
        }
    }

    Ok(ids)
}

#[derive(Debug, Clone)]
pub(super) struct PeSection {
    virtual_address: u32,
    virtual_size: u32,
    raw_pointer: u32,
    raw_size: u32,
}

pub(super) fn read_u16_le(bytes: &[u8], offset: usize) -> Result<u16, String> {
    let slice = bytes
        .get(offset..offset + 2)
        .ok_or_else(|| "Unexpected end of PE file.".to_string())?;
    Ok(u16::from_le_bytes([slice[0], slice[1]]))
}

pub(super) fn read_u32_le(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let slice = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| "Unexpected end of PE file.".to_string())?;
    Ok(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

pub(super) fn checked_slice(bytes: &[u8], offset: usize, size: usize) -> Result<&[u8], String> {
    bytes
        .get(offset..offset + size)
        .ok_or_else(|| "PE data directory pointed outside the file.".to_string())
}

pub(super) fn rva_to_offset(sections: &[PeSection], rva: u32) -> Option<usize> {
    for section in sections {
        let span = section.virtual_size.max(section.raw_size);
        let end = section.virtual_address.checked_add(span)?;
        if rva >= section.virtual_address && rva < end {
            let relative = rva.checked_sub(section.virtual_address)?;
            let file_offset = section.raw_pointer.checked_add(relative)?;
            return usize::try_from(file_offset).ok();
        }
    }

    None
}

pub(super) fn cli_metadata_bytes(bytes: &[u8]) -> Result<(&[u8], bool), String> {
    if checked_slice(bytes, 0, 2)? != b"MZ" {
        return Err("File is not a PE assembly.".to_string());
    }

    let pe_offset = usize::try_from(read_u32_le(bytes, 0x3c)?)
        .map_err(|_| "PE header offset overflowed.".to_string())?;
    if checked_slice(bytes, pe_offset, 4)? != b"PE\0\0" {
        return Err("File does not contain a PE header.".to_string());
    }

    let coff_offset = pe_offset + 4;
    let section_count = usize::from(read_u16_le(bytes, coff_offset + 2)?);
    let optional_header_size = usize::from(read_u16_le(bytes, coff_offset + 16)?);
    let optional_offset = coff_offset + 20;
    let optional_magic = read_u16_le(bytes, optional_offset)?;
    let data_directory_offset = match optional_magic {
        0x10b => optional_offset + 96,
        0x20b => optional_offset + 112,
        _ => return Err("Unsupported PE optional header format.".to_string()),
    };
    let cli_directory_offset = data_directory_offset + (14 * 8);
    let cli_rva = read_u32_le(bytes, cli_directory_offset)?;
    let cli_size = read_u32_le(bytes, cli_directory_offset + 4)?;
    if cli_rva == 0 || cli_size == 0 {
        return Err("PE file does not contain a CLR metadata directory.".to_string());
    }

    let section_table_offset = optional_offset + optional_header_size;
    let mut sections = Vec::new();
    for index in 0..section_count {
        let offset = section_table_offset + (index * 40);
        sections.push(PeSection {
            virtual_size: read_u32_le(bytes, offset + 8)?,
            virtual_address: read_u32_le(bytes, offset + 12)?,
            raw_size: read_u32_le(bytes, offset + 16)?,
            raw_pointer: read_u32_le(bytes, offset + 20)?,
        });
    }

    let cli_offset = rva_to_offset(&sections, cli_rva)
        .ok_or_else(|| "CLR header RVA was not mapped.".to_string())?;
    let metadata_rva = read_u32_le(bytes, cli_offset + 8)?;
    let metadata_size = read_u32_le(bytes, cli_offset + 12)?;
    let strong_name_rva = read_u32_le(bytes, cli_offset + 32).unwrap_or(0);
    let strong_name_size = read_u32_le(bytes, cli_offset + 36).unwrap_or(0);
    let metadata_offset = rva_to_offset(&sections, metadata_rva)
        .ok_or_else(|| "CLR metadata RVA was not mapped.".to_string())?;
    let metadata_size =
        usize::try_from(metadata_size).map_err(|_| "CLR metadata size overflowed.".to_string())?;

    Ok((
        checked_slice(bytes, metadata_offset, metadata_size)?,
        strong_name_rva != 0 && strong_name_size != 0,
    ))
}

pub(super) fn resolved_type_name(value: &ResolvedType) -> String {
    value.full_name()
}

pub(super) fn is_public_type(flags: u32) -> bool {
    matches!(flags & 0x0000_0007, 0x0000_0001 | 0x0000_0002)
}

pub(super) fn is_abstract_type(flags: u32) -> bool {
    flags & 0x0000_0080 != 0 || flags & 0x0000_0020 != 0
}

pub(super) fn discover_plugin_types(metadata: &Metadata) -> Vec<PluginDiscoveredType> {
    metadata
        .types()
        .into_iter()
        .enumerate()
        .filter_map(|(index, type_info)| {
            let full_name = type_info.full_name();
            if full_name == "<Module>" || full_name.starts_with('<') {
                return None;
            }

            let type_index = u32::try_from(index + 1).ok()?;
            let interfaces = metadata
                .get_interfaces(type_index)
                .into_iter()
                .map(|interface| resolved_type_name(&interface))
                .collect::<Vec<_>>();
            let base_type = metadata
                .get_base_type(type_index)
                .map(|item| item.full_name());
            let implements_i_plugin = interfaces
                .iter()
                .any(|interface| interface == "Microsoft.Xrm.Sdk.IPlugin");
            let is_workflow = base_type
                .as_deref()
                .map(|value| value == "System.Activities.CodeActivity")
                .unwrap_or(false);
            let kind = if implements_i_plugin {
                "plugin"
            } else if is_workflow {
                "workflow"
            } else {
                "unknown"
            };

            Some(PluginDiscoveredType {
                full_name,
                name: type_info.name,
                namespace: type_info.namespace,
                kind: kind.to_string(),
                is_abstract: is_abstract_type(type_info.flags),
                is_public: is_public_type(type_info.flags),
                implements_i_plugin,
                base_type,
            })
        })
        .collect()
}

pub(super) fn find_target_framework(bytes: &[u8]) -> Option<String> {
    let content = String::from_utf8_lossy(bytes);
    [".NETFramework", ".NETCoreApp", ".NETStandard"]
        .iter()
        .find_map(|marker| {
            let start = content.find(marker)?;
            let tail = &content[start..];
            let end = tail
                .find(|character: char| {
                    character == '\0' || character == '\u{1}' || character == '"'
                })
                .unwrap_or_else(|| tail.len().min(96));
            Some(tail[..end.min(tail.len())].to_string())
        })
}

pub(super) fn inspect_plugin_assembly_bytes(
    local_path: &str,
    bytes: &[u8],
) -> Result<PluginAssemblyInspection, String> {
    let (metadata_bytes, has_strong_name_directory) = cli_metadata_bytes(bytes)?;
    let metadata = Metadata::parse(metadata_bytes)
        .map_err(|error| format!("Could not parse CLR metadata: {error}"))?;
    let assembly = metadata
        .assembly()
        .ok_or_else(|| "CLR metadata did not include assembly identity.".to_string())?;
    let discovered_types = discover_plugin_types(&metadata);
    let registerable_count = discovered_types
        .iter()
        .filter(|item| item.kind != "unknown" && !item.is_abstract)
        .count();
    let mut warnings = Vec::new();
    let public_key_token = assembly
        .public_key_token_string()
        .unwrap_or_else(|| "null".to_string());
    let assembly_name = assembly.name.clone();
    let assembly_version = assembly.version_string();
    let strong_name_signed = has_strong_name_directory && public_key_token != "null";

    if !strong_name_signed {
        warnings.push("Assembly is not strong-name signed.".to_string());
    }

    if registerable_count == 0 {
        warnings.push("No exported IPlugin or CodeActivity types were discovered.".to_string());
    }

    if bytes.len() > 16 * 1024 * 1024 {
        warnings.push("Assembly is larger than 16 MB.".to_string());
    }

    Ok(PluginAssemblyInspection {
        local_path: local_path.to_string(),
        file_name: Path::new(local_path)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("assembly.dll")
            .to_string(),
        size_bytes: bytes.len() as u64,
        file_hash: Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect(),
        assembly_name,
        version: assembly_version,
        culture: assembly.culture.unwrap_or_else(|| "neutral".to_string()),
        public_key_token,
        target_framework: find_target_framework(metadata_bytes)
            .or_else(|| find_target_framework(bytes)),
        strong_name_signed,
        clr_metadata_version: Some(metadata.version().to_string()),
        discovered_types,
        warnings,
    })
}
#[tauri::command]
pub(super) fn inspect_plugin_assembly(
    local_path: String,
) -> Result<PluginAssemblyInspection, String> {
    let bytes = fs::read(&local_path)
        .map_err(|error| format!("Could not read plug-in assembly {}: {}", local_path, error))?;
    inspect_plugin_assembly_bytes(&local_path, &bytes)
}

#[tauri::command]
pub(super) async fn list_plugin_assemblies(
    app: AppHandle,
    environment: DataverseEnvironment,
) -> Result<Vec<PluginAssemblySummary>, String> {
    let values = dataverse_get_collection_values(
    &app,
    &environment,
    "/pluginassemblies",
    vec![
      (
        "$select".to_string(),
        "pluginassemblyid,name,version,culture,publickeytoken,isolationmode,sourcetype,ismanaged,iscustomizable,description,createdon,modifiedon,path,sourcehash,_packageid_value".to_string(),
      ),
      (
        "$expand".to_string(),
        "PackageId($select=pluginpackageid,name)".to_string(),
      ),
      ("$filter".to_string(), "ismanaged eq false".to_string()),
      ("$orderby".to_string(), "name asc".to_string()),
    ],
  )
  .await?;

    Ok(values
        .iter()
        .filter_map(plugin_assembly_from_value)
        .collect())
}

#[tauri::command]
pub(super) async fn list_plugin_packages(
    app: AppHandle,
    environment: DataverseEnvironment,
) -> Result<Vec<PluginPackageSummary>, String> {
    let values = dataverse_get_collection_values(
    &app,
    &environment,
    "/pluginpackages",
    vec![
      (
        "$select".to_string(),
        "pluginpackageid,name,uniquename,version,package_name,ismanaged,iscustomizable,createdon,modifiedon,statecode,statuscode".to_string(),
      ),
      ("$filter".to_string(), "ismanaged eq false".to_string()),
      ("$orderby".to_string(), "name asc".to_string()),
    ],
  )
  .await?;

    Ok(values
        .iter()
        .filter_map(plugin_package_from_value)
        .collect())
}

#[tauri::command]
pub(super) async fn list_plugin_types(
    app: AppHandle,
    environment: DataverseEnvironment,
    assembly_id: Option<String>,
) -> Result<Vec<PluginTypeSummary>, String> {
    let mut query = vec![
    (
      "$select".to_string(),
      "plugintypeid,name,friendlyname,typename,isworkflowactivity,ismanaged,description,createdon,modifiedon,_pluginassemblyid_value".to_string(),
    ),
    (
      "$expand".to_string(),
      "pluginassemblyid($select=pluginassemblyid,name,_packageid_value;$expand=PackageId($select=pluginpackageid,name))".to_string(),
    ),
    ("$orderby".to_string(), "typename asc".to_string()),
  ];

    let mut filters = vec!["ismanaged eq false".to_string()];

    if let Some(assembly_id) = assembly_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        filters.push(format!("_pluginassemblyid_value eq {assembly_id}"));
    }

    query.push(("$filter".to_string(), filters.join(" and ")));

    let values = dataverse_get_collection_values(&app, &environment, "/plugintypes", query).await?;

    Ok(values.iter().filter_map(plugin_type_from_value).collect())
}

#[tauri::command]
pub(super) async fn list_plugin_steps(
    app: AppHandle,
    environment: DataverseEnvironment,
    plugin_type_id: Option<String>,
    service_endpoint_id: Option<String>,
) -> Result<Vec<PluginStepSummary>, String> {
    let mut filters = vec!["ismanaged eq false".to_string()];
    if let Some(plugin_type_id) = plugin_type_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        filters.push(format!("_plugintypeid_value eq {plugin_type_id}"));
    }
    if let Some(service_endpoint_id) = service_endpoint_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        filters.push(format!("_eventhandler_value eq {service_endpoint_id}"));
    }

    let values = dataverse_get_collection_values(
    &app,
    &environment,
    "/sdkmessageprocessingsteps",
    vec![
      (
        "$select".to_string(),
        "sdkmessageprocessingstepid,name,stage,mode,rank,supporteddeployment,asyncautodelete,filteringattributes,configuration,description,ismanaged,iscustomizable,statecode,statuscode,createdon,modifiedon,_eventhandler_value,_plugintypeid_value,_sdkmessageid_value,_sdkmessagefilterid_value,_sdkmessageprocessingstepsecureconfigid_value,_impersonatinguserid_value".to_string(),
      ),
      (
        "$expand".to_string(),
        "sdkmessageid($select=sdkmessageid,name),sdkmessagefilterid($select=sdkmessagefilterid,primaryobjecttypecode,secondaryobjecttypecode),plugintypeid($select=plugintypeid,friendlyname,typename,_pluginassemblyid_value;$expand=pluginassemblyid($select=pluginassemblyid,name,_packageid_value;$expand=PackageId($select=pluginpackageid,name))),eventhandler_plugintype($select=plugintypeid,friendlyname,typename,_pluginassemblyid_value;$expand=pluginassemblyid($select=pluginassemblyid,name,_packageid_value;$expand=PackageId($select=pluginpackageid,name))),eventhandler_serviceendpoint($select=serviceendpointid,name),impersonatinguserid($select=systemuserid,fullname)".to_string(),
      ),
      ("$filter".to_string(), filters.join(" and ")),
      ("$orderby".to_string(), "name asc".to_string()),
    ],
  )
  .await?;

    Ok(values.iter().filter_map(plugin_step_from_value).collect())
}

#[tauri::command]
pub(super) async fn list_plugin_step_images(
    app: AppHandle,
    environment: DataverseEnvironment,
    step_id: Option<String>,
) -> Result<Vec<PluginStepImageSummary>, String> {
    let mut filters = vec!["ismanaged eq false".to_string()];
    if let Some(step_id) = step_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        filters.push(format!("_sdkmessageprocessingstepid_value eq {step_id}"));
    }

    let values = dataverse_get_collection_values(
    &app,
    &environment,
    "/sdkmessageprocessingstepimages",
    vec![
      (
        "$select".to_string(),
        "sdkmessageprocessingstepimageid,name,entityalias,imagetype,messagepropertyname,attributes,description,ismanaged,iscustomizable,createdon,modifiedon,_sdkmessageprocessingstepid_value".to_string(),
      ),
      (
        "$expand".to_string(),
        "sdkmessageprocessingstepid($select=sdkmessageprocessingstepid,name)".to_string(),
      ),
      ("$filter".to_string(), filters.join(" and ")),
      ("$orderby".to_string(), "name asc".to_string()),
    ],
  )
  .await?;

    Ok(values
        .iter()
        .filter_map(plugin_step_image_from_value)
        .collect())
}

#[tauri::command]
pub(super) async fn list_plugin_messages(
    app: AppHandle,
    environment: DataverseEnvironment,
) -> Result<Vec<PluginMessageSummary>, String> {
    let values = dataverse_get_collection_values(
        &app,
        &environment,
        "/sdkmessages",
        vec![
            (
                "$select".to_string(),
                "sdkmessageid,name,isprivate".to_string(),
            ),
            ("$filter".to_string(), "isprivate eq false".to_string()),
            ("$orderby".to_string(), "name asc".to_string()),
            ("$top".to_string(), "300".to_string()),
        ],
    )
    .await?;

    Ok(values
        .iter()
        .filter_map(plugin_message_from_value)
        .collect())
}

#[tauri::command]
pub(super) async fn list_plugin_message_filters(
    app: AppHandle,
    environment: DataverseEnvironment,
    message_id: String,
) -> Result<Vec<PluginMessageFilterSummary>, String> {
    let values = dataverse_get_collection_values(
    &app,
    &environment,
    "/sdkmessagefilters",
    vec![
      (
        "$select".to_string(),
        "sdkmessagefilterid,_sdkmessageid_value,primaryobjecttypecode,secondaryobjecttypecode,iscustomprocessingstepallowed".to_string(),
      ),
      (
        "$filter".to_string(),
        format!(
          "_sdkmessageid_value eq {} and iscustomprocessingstepallowed eq true",
          message_id.trim()
        ),
      ),
      ("$orderby".to_string(), "primaryobjecttypecode asc".to_string()),
    ],
  )
  .await?;

    Ok(values
        .iter()
        .filter_map(plugin_message_filter_from_value)
        .collect())
}

#[tauri::command]
pub(super) async fn list_plugin_service_endpoints(
    app: AppHandle,
    environment: DataverseEnvironment,
) -> Result<Vec<PluginServiceEndpointSummary>, String> {
    let values = dataverse_get_collection_values(
    &app,
    &environment,
    "/serviceendpoints",
    vec![
      (
        "$select".to_string(),
        "serviceendpointid,name,contract,authtype,url,path,namespaceaddress,messageformat,isauthvalueset,ismanaged,iscustomizable,description,createdon,modifiedon".to_string(),
      ),
      ("$filter".to_string(), "ismanaged eq false".to_string()),
      ("$orderby".to_string(), "name asc".to_string()),
    ],
  )
  .await?;

    Ok(values
        .iter()
        .filter_map(plugin_endpoint_from_value)
        .collect())
}

#[tauri::command]
pub(super) async fn list_plugin_system_users(
    app: AppHandle,
    environment: DataverseEnvironment,
) -> Result<Vec<PluginSystemUserSummary>, String> {
    let values = dataverse_get_collection_values(
        &app,
        &environment,
        "/systemusers",
        vec![
            (
                "$select".to_string(),
                "systemuserid,fullname,domainname,isdisabled".to_string(),
            ),
            ("$filter".to_string(), "isdisabled eq false".to_string()),
            ("$orderby".to_string(), "fullname asc".to_string()),
            ("$top".to_string(), "500".to_string()),
        ],
    )
    .await?;

    Ok(values.iter().filter_map(plugin_user_from_value).collect())
}

#[tauri::command]
pub(super) async fn get_plugin_registration_snapshot(
    app: AppHandle,
    environment: DataverseEnvironment,
) -> Result<PluginRegistrationSnapshot, String> {
    let (assemblies_result, packages_result, messages_result, endpoints_result, users_result) = tokio::join!(
        plugin_snapshot_section(
            "Assemblies",
            list_plugin_assemblies(app.clone(), environment.clone())
        ),
        plugin_snapshot_section(
            "Packages",
            list_plugin_packages(app.clone(), environment.clone())
        ),
        plugin_snapshot_section(
            "Messages",
            list_plugin_messages(app.clone(), environment.clone())
        ),
        plugin_snapshot_section(
            "Service endpoints",
            list_plugin_service_endpoints(app.clone(), environment.clone())
        ),
        plugin_snapshot_section("Users", list_plugin_system_users(app, environment)),
    );
    let mut warnings = [
        assemblies_result.1,
        packages_result.1,
        messages_result.1,
        endpoints_result.1,
        users_result.1,
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>();

    if assemblies_result.0.is_empty()
        && packages_result.0.is_empty()
        && endpoints_result.0.is_empty()
        && warnings.is_empty()
    {
        warnings.push("No plug-in registrations were returned for this environment.".to_string());
    }

    Ok(PluginRegistrationSnapshot {
        assemblies: assemblies_result.0,
        packages: packages_result.0,
        types: Vec::new(),
        steps: Vec::new(),
        images: Vec::new(),
        messages: messages_result.0,
        endpoints: endpoints_result.0,
        users: users_result.0,
        stage_options: plugin_options_stage(),
        mode_options: plugin_options_mode(),
        deployment_options: plugin_options_deployment(),
        isolation_mode_options: plugin_options_isolation(),
        source_type_options: plugin_options_source_type(),
        image_type_options: plugin_options_image_type(),
        endpoint_contract_options: plugin_options_endpoint_contract(),
        endpoint_auth_type_options: plugin_options_endpoint_auth_type(),
        warnings,
    })
}

#[tauri::command]
pub(super) async fn register_plugin_assembly(
    app: AppHandle,
    environment: DataverseEnvironment,
    input: RegisterPluginAssemblyInput,
) -> Result<PluginWriteResult, String> {
    let bytes = fs::read(&input.local_path).map_err(|error| {
        format!(
            "Could not read plug-in assembly {}: {}",
            input.local_path, error
        )
    })?;
    let inspection = inspect_plugin_assembly_bytes(&input.local_path, &bytes)?;
    let content = BASE64.encode(&bytes);
    let source_hash = Sha256::digest(&bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let file_name = Path::new(&input.local_path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("assembly.dll");
    let mut payload = serde_json::json!({
      "name": input.name.trim(),
      "version": input.version.trim(),
      "culture": input.culture.trim(),
      "publickeytoken": input.public_key_token.trim(),
      "isolationmode": input.isolation_mode,
      "sourcetype": input.source_type,
      "content": content,
      "sourcehash": source_hash,
      "path": file_name,
    });

    if let Some(description) = sanitize_optional_string(input.description) {
        payload["description"] = Value::String(description);
    }

    let (body, entity_id) = dataverse_post_json_with_headers(
        &app,
        &environment,
        "/pluginassemblies",
        &payload,
        &[("Prefer", "return=representation".to_string())],
    )
    .await?;
    let assembly_id = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|value| json_string(&value, "pluginassemblyid"))
        .or_else(|| entity_id.as_deref().and_then(guid_from_entity_id))
        .ok_or_else(|| "Dataverse did not return the created assembly id.".to_string())?;

    add_registration_component_to_solution(
        &app,
        &environment,
        input.solution_unique_name.as_deref(),
        &assembly_id,
        91,
    )
    .await?;
    let type_names = if input.type_names.is_empty() {
        inspection
            .discovered_types
            .iter()
            .filter(|item| item.kind != "unknown" && !item.is_abstract)
            .map(|item| item.full_name.clone())
            .collect::<Vec<_>>()
    } else {
        input.type_names
    };
    let created_types = create_plugin_type_records(
        &app,
        &environment,
        &assembly_id,
        &type_names,
        input.solution_unique_name.as_deref(),
    )
    .await?;

    Ok(PluginWriteResult {
        id: Some(assembly_id),
        message: format!(
            "Registered {} with {} plug-in type{}",
            input.name,
            created_types.len(),
            if created_types.len() == 1 { "" } else { "s" }
        ),
    })
}

#[tauri::command]
pub(super) async fn update_plugin_assembly(
    app: AppHandle,
    environment: DataverseEnvironment,
    input: UpdatePluginAssemblyInput,
) -> Result<PluginWriteResult, String> {
    assert_plugin_row_editable(
        &app,
        &environment,
        &format!("/pluginassemblies({})", input.assembly_id),
        &["name"],
    )
    .await?;
    let bytes = fs::read(&input.local_path).map_err(|error| {
        format!(
            "Could not read plug-in assembly {}: {}",
            input.local_path, error
        )
    })?;
    let content = BASE64.encode(&bytes);
    let source_hash = Sha256::digest(&bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let file_name = Path::new(&input.local_path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("assembly.dll");
    let mut payload = serde_json::json!({
      "name": input.name.trim(),
      "version": input.version.trim(),
      "culture": input.culture.trim(),
      "publickeytoken": input.public_key_token.trim(),
      "isolationmode": input.isolation_mode,
      "sourcetype": input.source_type,
      "content": content,
      "sourcehash": source_hash,
      "path": file_name,
    });

    if let Some(description) = sanitize_optional_string(input.description) {
        payload["description"] = Value::String(description);
    }

    dataverse_json_request(
        &app,
        &environment,
        reqwest::Method::PATCH,
        &format!("/pluginassemblies({})", input.assembly_id),
        &payload,
    )
    .await?;
    add_registration_component_to_solution(
        &app,
        &environment,
        input.solution_unique_name.as_deref(),
        &input.assembly_id,
        91,
    )
    .await?;

    Ok(PluginWriteResult {
        id: Some(input.assembly_id),
        message: format!("Updated {}", input.name),
    })
}

#[tauri::command]
pub(super) async fn unregister_plugin_assembly(
    app: AppHandle,
    environment: DataverseEnvironment,
    assembly_id: String,
) -> Result<PluginWriteResult, String> {
    assert_plugin_row_editable(
        &app,
        &environment,
        &format!("/pluginassemblies({assembly_id})"),
        &["name"],
    )
    .await?;
    dataverse_empty_request(
        &app,
        &environment,
        reqwest::Method::DELETE,
        &format!("/pluginassemblies({assembly_id})"),
    )
    .await?;

    Ok(PluginWriteResult {
        id: Some(assembly_id),
        message: "Unregistered plug-in assembly".to_string(),
    })
}

#[tauri::command]
pub(super) async fn create_plugin_type(
    app: AppHandle,
    environment: DataverseEnvironment,
    input: CreatePluginTypeInput,
) -> Result<PluginWriteResult, String> {
    let type_name = validate_plugin_type_name(&input.type_name)?;
    assert_plugin_row_editable(
        &app,
        &environment,
        &format!("/pluginassemblies({})", input.assembly_id),
        &["name"],
    )
    .await?;
    let friendly_name = sanitize_optional_string(input.friendly_name).unwrap_or_else(|| {
        type_name
            .rsplit('.')
            .next()
            .unwrap_or(&type_name)
            .to_string()
    });
    let mut payload = serde_json::json!({
      "name": type_name,
      "typename": type_name,
      "friendlyname": friendly_name,
      "isworkflowactivity": input.is_workflow_activity,
      "pluginassemblyid@odata.bind": format!("/pluginassemblies({})", input.assembly_id),
    });

    if let Some(description) = sanitize_optional_string(input.description) {
        payload["description"] = Value::String(description);
    }

    let (body, entity_id) = dataverse_post_json_with_headers(
        &app,
        &environment,
        "/plugintypes",
        &payload,
        &[("Prefer", "return=representation".to_string())],
    )
    .await?;
    let id = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|value| json_string(&value, "plugintypeid"))
        .or_else(|| entity_id.as_deref().and_then(guid_from_entity_id));

    if let Some(id) = &id {
        add_registration_component_to_solution(
            &app,
            &environment,
            input.solution_unique_name.as_deref(),
            id,
            90,
        )
        .await?;
    }

    Ok(PluginWriteResult {
        id,
        message: "Created plug-in type".to_string(),
    })
}

#[tauri::command]
pub(super) async fn unregister_plugin_type(
    app: AppHandle,
    environment: DataverseEnvironment,
    plugin_type_id: String,
) -> Result<PluginWriteResult, String> {
    assert_plugin_row_editable(
        &app,
        &environment,
        &format!("/plugintypes({plugin_type_id})"),
        &["friendlyname", "typename", "name"],
    )
    .await?;
    dataverse_empty_request(
        &app,
        &environment,
        reqwest::Method::DELETE,
        &format!("/plugintypes({plugin_type_id})"),
    )
    .await?;

    Ok(PluginWriteResult {
        id: Some(plugin_type_id),
        message: "Unregistered plug-in type".to_string(),
    })
}

pub(super) async fn upsert_secure_config(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    existing_id: Option<String>,
    secure_configuration: Option<String>,
) -> Result<Option<String>, String> {
    let secure_configuration = sanitize_optional_string(secure_configuration);
    let Some(secure_configuration) = secure_configuration else {
        return Ok(existing_id);
    };

    if let Some(existing_id) = existing_id {
        dataverse_json_request(
            app,
            environment,
            reqwest::Method::PATCH,
            &format!("/sdkmessageprocessingstepsecureconfigs({existing_id})"),
            &serde_json::json!({ "secureconfig": secure_configuration }),
        )
        .await?;
        return Ok(Some(existing_id));
    }

    let (body, entity_id) = dataverse_post_json_with_headers(
        app,
        environment,
        "/sdkmessageprocessingstepsecureconfigs",
        &serde_json::json!({ "secureconfig": secure_configuration }),
        &[("Prefer", "return=representation".to_string())],
    )
    .await?;

    Ok(serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|value| json_string(&value, "sdkmessageprocessingstepsecureconfigid"))
        .or_else(|| entity_id.as_deref().and_then(guid_from_entity_id)))
}

#[tauri::command]
pub(super) async fn register_plugin_step(
    app: AppHandle,
    environment: DataverseEnvironment,
    input: RegisterPluginStepInput,
) -> Result<PluginWriteResult, String> {
    if let Some(step_id) = &input.step_id {
        assert_plugin_row_editable(
            &app,
            &environment,
            &format!("/sdkmessageprocessingsteps({step_id})"),
            &["name"],
        )
        .await?;
    }
    let existing_step = if let Some(step_id) = &input.step_id {
        Some(
            dataverse_get_json_value(
                &app,
                &environment,
                &format!("/sdkmessageprocessingsteps({step_id})"),
                &[("$select", "_sdkmessageprocessingstepsecureconfigid_value")],
            )
            .await?,
        )
    } else {
        None
    };
    let existing_secure_id = existing_step
        .as_ref()
        .and_then(|value| json_lookup_id(value, "sdkmessageprocessingstepsecureconfigid"));
    let secure_config_id = upsert_secure_config(
        &app,
        &environment,
        existing_secure_id,
        input.secure_configuration.clone(),
    )
    .await?;
    let mut payload = serde_json::json!({
      "name": input.name.trim(),
      "stage": input.stage,
      "mode": input.mode,
      "rank": input.rank,
      "supporteddeployment": input.supported_deployment,
      "asyncautodelete": input.async_auto_delete.unwrap_or(false),
      "sdkmessageid@odata.bind": format!("/sdkmessages({})", input.message_id),
    });

    if input.handler_type == "serviceendpoint" {
        let endpoint_id = input
            .service_endpoint_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "Service endpoint is required.".to_string())?;
        payload["eventhandler_serviceendpoint@odata.bind"] =
            Value::String(format!("/serviceendpoints({endpoint_id})"));
    } else {
        let plugin_type_id = input
            .plugin_type_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "Plug-in type is required.".to_string())?;
        payload["eventhandler_plugintype@odata.bind"] =
            Value::String(format!("/plugintypes({plugin_type_id})"));
        payload["plugintypeid@odata.bind"] =
            Value::String(format!("/plugintypes({plugin_type_id})"));
    }

    if let Some(message_filter_id) = input
        .message_filter_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        payload["sdkmessagefilterid@odata.bind"] =
            Value::String(format!("/sdkmessagefilters({message_filter_id})"));
    }

    if let Some(secure_config_id) = secure_config_id {
        payload["sdkmessageprocessingstepsecureconfigid@odata.bind"] = Value::String(format!(
            "/sdkmessageprocessingstepsecureconfigs({secure_config_id})"
        ));
    }

    if let Some(user_id) = input
        .impersonating_user_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        payload["impersonatinguserid@odata.bind"] =
            Value::String(format!("/systemusers({user_id})"));
    }

    if let Some(value) = sanitize_optional_string(input.filtering_attributes) {
        payload["filteringattributes"] = Value::String(value);
    }
    if let Some(value) = sanitize_optional_string(input.configuration) {
        payload["configuration"] = Value::String(value);
    }
    if let Some(value) = sanitize_optional_string(input.description) {
        payload["description"] = Value::String(value);
    }

    let step_id = if let Some(step_id) = input.step_id {
        dataverse_json_request(
            &app,
            &environment,
            reqwest::Method::PATCH,
            &format!("/sdkmessageprocessingsteps({step_id})"),
            &payload,
        )
        .await?;
        step_id
    } else {
        let (body, entity_id) = dataverse_post_json_with_headers(
            &app,
            &environment,
            "/sdkmessageprocessingsteps",
            &payload,
            &[("Prefer", "return=representation".to_string())],
        )
        .await?;
        let step_id = serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|value| json_string(&value, "sdkmessageprocessingstepid"))
            .or_else(|| entity_id.as_deref().and_then(guid_from_entity_id))
            .ok_or_else(|| "Dataverse did not return the step id.".to_string())?;
        add_registration_component_to_solution(
            &app,
            &environment,
            input.solution_unique_name.as_deref(),
            &step_id,
            92,
        )
        .await?;
        step_id
    };

    set_plugin_step_state(
        app.clone(),
        environment.clone(),
        step_id.clone(),
        input.enabled,
    )
    .await?;

    Ok(PluginWriteResult {
        id: Some(step_id),
        message: format!("Saved {}", input.name),
    })
}

#[tauri::command]
pub(super) async fn set_plugin_step_state(
    app: AppHandle,
    environment: DataverseEnvironment,
    step_id: String,
    enabled: bool,
) -> Result<PluginWriteResult, String> {
    assert_plugin_row_editable(
        &app,
        &environment,
        &format!("/sdkmessageprocessingsteps({step_id})"),
        &["name"],
    )
    .await?;
    let (statecode, statuscode) = if enabled { (0, 1) } else { (1, 2) };
    dataverse_json_request(
        &app,
        &environment,
        reqwest::Method::PATCH,
        &format!("/sdkmessageprocessingsteps({step_id})"),
        &serde_json::json!({ "statecode": statecode, "statuscode": statuscode }),
    )
    .await?;

    Ok(PluginWriteResult {
        id: Some(step_id),
        message: if enabled {
            "Enabled step".to_string()
        } else {
            "Disabled step".to_string()
        },
    })
}

#[tauri::command]
pub(super) async fn set_plugin_component_state(
    app: AppHandle,
    environment: DataverseEnvironment,
    component: PluginComponentStateInput,
) -> Result<PluginWriteResult, String> {
    match component.component_kind.as_str() {
        "step" => set_plugin_step_state(app, environment, component.id, component.enabled).await,
        "endpoint" => Err("Service endpoints do not expose step-style state fields.".to_string()),
        _ => Err("Only step state changes are supported.".to_string()),
    }
}

#[tauri::command]
pub(super) async fn unregister_plugin_step(
    app: AppHandle,
    environment: DataverseEnvironment,
    step_id: String,
) -> Result<PluginWriteResult, String> {
    assert_plugin_row_editable(
        &app,
        &environment,
        &format!("/sdkmessageprocessingsteps({step_id})"),
        &["name"],
    )
    .await?;
    dataverse_empty_request(
        &app,
        &environment,
        reqwest::Method::DELETE,
        &format!("/sdkmessageprocessingsteps({step_id})"),
    )
    .await?;

    Ok(PluginWriteResult {
        id: Some(step_id),
        message: "Unregistered step".to_string(),
    })
}

#[tauri::command]
pub(super) async fn register_plugin_step_image(
    app: AppHandle,
    environment: DataverseEnvironment,
    input: RegisterPluginStepImageInput,
) -> Result<PluginWriteResult, String> {
    if let Some(image_id) = &input.image_id {
        assert_plugin_row_editable(
            &app,
            &environment,
            &format!("/sdkmessageprocessingstepimages({image_id})"),
            &["name"],
        )
        .await?;
    }
    let step = dataverse_get_json_value(
        &app,
        &environment,
        &format!("/sdkmessageprocessingsteps({})", input.step_id),
        &[
            ("$select", "name"),
            ("$expand", "sdkmessageid($select=name)"),
        ],
    )
    .await?;
    let message_name = step
        .get("sdkmessageid")
        .and_then(|value| json_string(value, "name"))
        .unwrap_or_default();
    if message_name == "Create" && input.image_type == 0 {
        return Err("Create steps cannot have a pre-image.".to_string());
    }

    let mut payload = serde_json::json!({
      "name": input.name.trim(),
      "entityalias": input.entity_alias.trim(),
      "imagetype": input.image_type,
      "messagepropertyname": input.message_property_name.trim(),
      "sdkmessageprocessingstepid@odata.bind": format!("/sdkmessageprocessingsteps({})", input.step_id),
    });

    if let Some(value) = sanitize_optional_string(input.attributes) {
        payload["attributes"] = Value::String(value);
    }
    if let Some(value) = sanitize_optional_string(input.description) {
        payload["description"] = Value::String(value);
    }

    let image_id = if let Some(image_id) = input.image_id {
        dataverse_json_request(
            &app,
            &environment,
            reqwest::Method::PATCH,
            &format!("/sdkmessageprocessingstepimages({image_id})"),
            &payload,
        )
        .await?;
        image_id
    } else {
        let (body, entity_id) = dataverse_post_json_with_headers(
            &app,
            &environment,
            "/sdkmessageprocessingstepimages",
            &payload,
            &[("Prefer", "return=representation".to_string())],
        )
        .await?;
        let image_id = serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|value| json_string(&value, "sdkmessageprocessingstepimageid"))
            .or_else(|| entity_id.as_deref().and_then(guid_from_entity_id))
            .ok_or_else(|| "Dataverse did not return the image id.".to_string())?;
        add_registration_component_to_solution(
            &app,
            &environment,
            input.solution_unique_name.as_deref(),
            &image_id,
            93,
        )
        .await?;
        image_id
    };

    Ok(PluginWriteResult {
        id: Some(image_id),
        message: format!("Saved image {}", input.name),
    })
}

#[tauri::command]
pub(super) async fn unregister_plugin_step_image(
    app: AppHandle,
    environment: DataverseEnvironment,
    image_id: String,
) -> Result<PluginWriteResult, String> {
    assert_plugin_row_editable(
        &app,
        &environment,
        &format!("/sdkmessageprocessingstepimages({image_id})"),
        &["name"],
    )
    .await?;
    dataverse_empty_request(
        &app,
        &environment,
        reqwest::Method::DELETE,
        &format!("/sdkmessageprocessingstepimages({image_id})"),
    )
    .await?;

    Ok(PluginWriteResult {
        id: Some(image_id),
        message: "Unregistered image".to_string(),
    })
}

#[tauri::command]
pub(super) async fn register_plugin_service_endpoint(
    app: AppHandle,
    environment: DataverseEnvironment,
    input: RegisterPluginServiceEndpointInput,
) -> Result<PluginWriteResult, String> {
    if let Some(endpoint_id) = &input.endpoint_id {
        assert_plugin_row_editable(
            &app,
            &environment,
            &format!("/serviceendpoints({endpoint_id})"),
            &["name"],
        )
        .await?;
    }
    let mut payload = serde_json::json!({
      "name": input.name.trim(),
      "contract": input.contract,
      "authtype": input.auth_type,
    });

    if let Some(value) = sanitize_optional_string(input.url) {
        payload["url"] = Value::String(value);
    }
    if let Some(value) = sanitize_optional_string(input.path) {
        payload["path"] = Value::String(value);
    }
    if let Some(value) = sanitize_optional_string(input.namespace_address) {
        payload["namespaceaddress"] = Value::String(value);
    }
    if let Some(value) = input.message_format {
        payload["messageformat"] = serde_json::json!(value);
    }
    if let Some(value) = sanitize_optional_string(input.auth_value) {
        payload["authvalue"] = Value::String(value);
    }
    if let Some(value) = sanitize_optional_string(input.description) {
        payload["description"] = Value::String(value);
    }

    let endpoint_id = if let Some(endpoint_id) = input.endpoint_id {
        dataverse_json_request(
            &app,
            &environment,
            reqwest::Method::PATCH,
            &format!("/serviceendpoints({endpoint_id})"),
            &payload,
        )
        .await?;
        endpoint_id
    } else {
        let (body, entity_id) = dataverse_post_json_with_headers(
            &app,
            &environment,
            "/serviceendpoints",
            &payload,
            &[("Prefer", "return=representation".to_string())],
        )
        .await?;
        let endpoint_id = serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|value| json_string(&value, "serviceendpointid"))
            .or_else(|| entity_id.as_deref().and_then(guid_from_entity_id))
            .ok_or_else(|| "Dataverse did not return the endpoint id.".to_string())?;
        add_registration_component_to_solution(
            &app,
            &environment,
            input.solution_unique_name.as_deref(),
            &endpoint_id,
            95,
        )
        .await?;
        endpoint_id
    };

    Ok(PluginWriteResult {
        id: Some(endpoint_id),
        message: format!("Saved endpoint {}", input.name),
    })
}

#[tauri::command]
pub(super) async fn unregister_plugin_service_endpoint(
    app: AppHandle,
    environment: DataverseEnvironment,
    endpoint_id: String,
) -> Result<PluginWriteResult, String> {
    assert_plugin_row_editable(
        &app,
        &environment,
        &format!("/serviceendpoints({endpoint_id})"),
        &["name"],
    )
    .await?;
    dataverse_empty_request(
        &app,
        &environment,
        reqwest::Method::DELETE,
        &format!("/serviceendpoints({endpoint_id})"),
    )
    .await?;

    Ok(PluginWriteResult {
        id: Some(endpoint_id),
        message: "Unregistered endpoint".to_string(),
    })
}

#[tauri::command]
pub(super) async fn get_plugin_component_dependencies(
    app: AppHandle,
    environment: DataverseEnvironment,
    object_id: String,
    component_type: i32,
) -> Result<SolutionDependencyReport, String> {
    get_solution_component_dependencies(app, environment, object_id, component_type).await
}

#[tauri::command]
pub(super) async fn export_plugin_registration(
    app: AppHandle,
    environment: DataverseEnvironment,
    input: PluginExportInput,
) -> Result<PluginWriteResult, String> {
    let snapshot = get_plugin_registration_snapshot(app, environment).await?;
    let mut value = serde_json::to_value(&snapshot).map_err(|error| error.to_string())?;

    if !input.include_managed {
        if let Some(object) = value.as_object_mut() {
            for key in [
                "assemblies",
                "packages",
                "types",
                "steps",
                "images",
                "endpoints",
            ] {
                if let Some(items) = object.get_mut(key).and_then(Value::as_array_mut) {
                    items.retain(|item| !json_bool(item, "isManaged").unwrap_or(false));
                }
            }
        }
    }

    if !input.component_ids.is_empty() {
        let component_ids = input.component_ids.iter().cloned().collect::<HashSet<_>>();
        if let Some(object) = value.as_object_mut() {
            for key in [
                "assemblies",
                "packages",
                "types",
                "steps",
                "images",
                "endpoints",
            ] {
                if let Some(items) = object.get_mut(key).and_then(Value::as_array_mut) {
                    items.retain(|item| {
                        json_string(item, "id")
                            .map(|id| component_ids.contains(&id))
                            .unwrap_or(false)
                    });
                }
            }
        }
    }

    let data = serde_json::to_string_pretty(&value).map_err(|error| error.to_string())?;
    fs::write(&input.local_path, data)
        .map_err(|error| format!("Could not write export {}: {}", input.local_path, error))?;

    Ok(PluginWriteResult {
        id: None,
        message: format!("Exported plugin registration to {}", input.local_path),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assembly_metadata_rejects_non_pe_files() {
        let error = inspect_plugin_assembly_bytes("not-a-plugin.dll", b"not a pe file")
            .expect_err("non-PE bytes must be rejected");

        assert!(error.contains("PE"));
    }

    #[test]
    fn plugin_registration_read_model_maps_core_option_labels() {
        assert_eq!(plugin_stage_label(20), "Pre-operation");
        assert_eq!(plugin_mode_label(1), "Asynchronous");
        assert_eq!(plugin_image_type_label(2), "Both");
        assert_eq!(plugin_endpoint_contract_label(8), "Webhook");
    }

    #[test]
    fn plugin_registration_read_model_marks_managed_components_read_only() {
        let editable = plugin_editable_state(true, Some(true), "Contoso.Plugin");

        assert!(!editable.can_edit);
        assert!(!editable.can_delete);
        assert!(editable
            .reasons
            .iter()
            .any(|reason| reason == "Managed component"));
    }
}
