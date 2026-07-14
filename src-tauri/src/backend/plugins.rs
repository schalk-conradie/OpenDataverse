mod assembly_inspection;
mod read_model;

use self::{
    assembly_inspection::{inspect_plugin_assembly_bytes, PluginAssemblyInspection},
    read_model::{
        plugin_assembly_from_value, plugin_endpoint_from_value, plugin_message_filter_from_value,
        plugin_message_from_value, plugin_options_deployment, plugin_options_endpoint_auth_type,
        plugin_options_endpoint_contract, plugin_options_image_type, plugin_options_isolation,
        plugin_options_mode, plugin_options_source_type, plugin_options_stage,
        plugin_package_from_value, plugin_step_from_value, plugin_step_image_from_value,
        plugin_type_from_value, plugin_user_from_value, reject_read_only_component,
        PluginAssemblySummary, PluginMessageFilterSummary, PluginMessageSummary,
        PluginPackageSummary, PluginRegistrationSnapshot, PluginServiceEndpointSummary,
        PluginStepImageSummary, PluginStepSummary, PluginSystemUserSummary, PluginTypeSummary,
    },
};
use super::solutions::{get_solution_component_dependencies, SolutionDependencyReport};
use super::{
    dataverse::{
        dataverse_empty_request, dataverse_get_collection_values, dataverse_get_json_value,
        dataverse_json_request, dataverse_post_json_with_headers, guid_from_entity_id, json_bool,
        json_lookup_id, json_string, validate_logical_name,
    },
    storage::DataverseEnvironment,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::HashSet, fs, path::Path, time::Duration};
use tauri::AppHandle;

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
