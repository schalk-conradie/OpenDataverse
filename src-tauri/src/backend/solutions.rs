mod components;
mod web_resource_writes;

use self::{
    components::{
        dependency_function_items, enrich_solution_components, solution_component_from_value,
        solution_component_values, solution_layer_from_value,
    },
    web_resource_writes::{
        add_web_resource_to_solution, create_web_resource_record, ensure_unmanaged_solution,
        file_name_path, import_file_plan, remove_solution_component_payload, NewWebResourceRecord,
    },
};
use super::web_resources::{
    is_microsoft_web_resource_name, map_resource_type, resource_type_code, web_resource_type_filter,
};
use super::{
    dataverse::{
        dataverse_get_collection_values, dataverse_json_request, json_bool, json_i32, json_string,
        odata_string_literal, validate_logical_name,
    },
    storage::DataverseEnvironment,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashSet, fs};
use tauri::AppHandle;

const WEB_RESOURCE_COMPONENT_TYPE: i32 = 61;

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
        NewWebResourceRecord {
            solution_unique_name: &solution_unique_name,
            name,
            display_name,
            description,
            type_code,
            bytes: input.content.as_bytes(),
        },
    )
    .await?;

    Ok(SolutionWriteResult {
        web_resource_id,
        message: format!("Created {name} in {solution_unique_name}"),
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
            NewWebResourceRecord {
                solution_unique_name: &solution_unique_name,
                name: &name,
                display_name: &display_name,
                description: &input.description,
                type_code,
                bytes: &bytes,
            },
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
