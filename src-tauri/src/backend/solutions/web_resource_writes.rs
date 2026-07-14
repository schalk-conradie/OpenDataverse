use super::super::{
    dataverse::{
        dataverse_get_collection_values, dataverse_get_json_value, dataverse_json_request,
        dataverse_post_json_with_headers, guid_from_entity_id, json_bool, json_string,
        odata_string_literal,
    },
    storage::DataverseEnvironment,
    web_resources::is_microsoft_web_resource_name,
};
use super::{SolutionWriteResult, WebResourceImportSkip, WEB_RESOURCE_COMPONENT_TYPE};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    path::{Component, Path, PathBuf},
};
use tauri::AppHandle;

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

pub(super) fn remove_solution_component_payload(
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

#[derive(Debug, Clone)]
pub(super) struct WebResourceImportFile {
    pub(super) path: PathBuf,
    relative_path: String,
}

pub(super) async fn ensure_unmanaged_solution(
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

pub(super) async fn add_web_resource_to_solution(
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

pub(super) fn file_name_path(path: &Path) -> Result<String, String> {
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

pub(super) type WebResourceImportPlan = (
    Vec<(WebResourceImportFile, String, i32)>,
    Vec<WebResourceImportSkip>,
);

pub(super) fn import_file_plan(
    source_paths: &[String],
    target_root: &str,
) -> Result<WebResourceImportPlan, String> {
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

pub(super) struct NewWebResourceRecord<'a> {
    pub(super) solution_unique_name: &'a str,
    pub(super) name: &'a str,
    pub(super) display_name: &'a str,
    pub(super) description: &'a str,
    pub(super) type_code: i32,
    pub(super) bytes: &'a [u8],
}

pub(super) async fn create_web_resource_record(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    resource: NewWebResourceRecord<'_>,
) -> Result<Option<String>, String> {
    let content = BASE64.encode(resource.bytes);
    let mut payload = serde_json::json!({
      "name": resource.name,
      "webresourcetype": resource.type_code,
      "content": content,
    });

    if !resource.display_name.trim().is_empty() {
        payload["displayname"] = Value::String(resource.display_name.trim().to_string());
    }

    if !resource.description.trim().is_empty() {
        payload["description"] = Value::String(resource.description.trim().to_string());
    }

    let (body, entity_id) = dataverse_post_json_with_headers(
        app,
        environment,
        "/webresourceset",
        &payload,
        &[
            (
                "MSCRM.SolutionUniqueName",
                resource.solution_unique_name.to_string(),
            ),
            ("Prefer", "return=representation".to_string()),
        ],
    )
    .await?;

    Ok(serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|value| json_string(&value, "webresourceid"))
        .or_else(|| entity_id.as_deref().and_then(guid_from_entity_id)))
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
}
