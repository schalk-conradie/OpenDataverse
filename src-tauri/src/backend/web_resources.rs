use super::*;

#[derive(Debug, Deserialize)]
pub(super) struct WebResourceApiResponse {
    value: Vec<WebResourceApiItem>,
}

#[derive(Debug, Deserialize)]
pub(super) struct WebResourceApiItem {
    #[serde(rename = "webresourceid")]
    id: String,
    name: String,
    #[serde(rename = "webresourcetype")]
    web_resource_type: Option<i32>,
    #[serde(rename = "versionnumber")]
    version: Option<i64>,
    #[serde(rename = "ismanaged")]
    is_managed: bool,
    #[serde(rename = "modifiedon")]
    modified_on: Option<String>,
    #[serde(rename = "_modifiedby_value")]
    modified_by_id: Option<String>,
    #[serde(rename = "modifiedby")]
    modified_by: Option<WebResourceUserApiItem>,
}

#[derive(Debug, Deserialize)]
pub(super) struct WebResourceContentApiItem {
    #[serde(rename = "webresourceid")]
    id: String,
    name: String,
    #[serde(rename = "webresourcetype")]
    web_resource_type: Option<i32>,
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct WebResourceUserApiItem {
    #[serde(rename = "systemuserid")]
    id: Option<String>,
    #[serde(rename = "fullname")]
    full_name: Option<String>,
    #[serde(rename = "domainname")]
    domain_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WebResource {
    id: String,
    name: String,
    #[serde(rename = "type")]
    resource_type: String,
    version: String,
    is_managed: bool,
    solution: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_on: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_by: Option<WebResourceUser>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WebResourceContent {
    id: String,
    name: String,
    #[serde(rename = "type")]
    resource_type: String,
    language: String,
    content: String,
    content_encoding: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    mime_type: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PublishResult {
    web_resource_id: String,
    web_resource_name: String,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DeleteWebResourcesResult {
    deleted: usize,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DownloadWebResourcesResult {
    downloaded: usize,
    target_path: String,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WebResourceUser {
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    domain_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WebResourceActivity {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    web_resource_id: Option<String>,
    web_resource_name: String,
    occurred_on: String,
    actor_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    actor_domain: Option<String>,
    action: String,
    operation: String,
    kind: String,
    changed_attributes: Vec<String>,
    detail: String,
}

fn user_from_api(
    value: Option<WebResourceUserApiItem>,
    fallback_id: Option<String>,
) -> Option<WebResourceUser> {
    let user = value?;
    let name = user.full_name?.trim().to_string();
    if name.is_empty() {
        return None;
    }

    Some(WebResourceUser {
        id: user.id.or(fallback_id),
        name,
        domain_name: user.domain_name,
    })
}

fn annotation_key(key: &str) -> String {
    format!("{key}@OData.Community.Display.V1.FormattedValue")
}

fn formatted_value(value: &Value, key: &str) -> Option<String> {
    json_string(value, &annotation_key(key))
}

fn operation_label(value: Option<i64>) -> String {
    match value {
        Some(1) => "Create",
        Some(2) => "Update",
        Some(3) => "Delete",
        Some(4) => "Access",
        _ => "Activity",
    }
    .to_string()
}

fn audit_kind(action: &str, operation: &str) -> String {
    let action = action.to_lowercase();
    let operation = operation.to_lowercase();

    if action.contains("publish") || operation.contains("publish") {
        "publish"
    } else if operation.contains("create") {
        "create"
    } else if operation.contains("delete") {
        "delete"
    } else {
        "change"
    }
    .to_string()
}

fn readable_attribute_name(name: &str) -> String {
    match name {
        "content" | "content_binary" | "contentfileref" => "Content".to_string(),
        "contentjson" | "contentjsonfileref" => "Content JSON".to_string(),
        "description" => "Description".to_string(),
        "displayname" => "Display name".to_string(),
        "ishidden" => "Hidden".to_string(),
        "ismanaged" => "Managed state".to_string(),
        "name" => "Name".to_string(),
        "versionnumber" => "Version number".to_string(),
        "webresourcetype" => "Type".to_string(),
        "_modifiedby_value" | "modifiedby" => "Modified by".to_string(),
        "_createdby_value" | "createdby" => "Created by".to_string(),
        _ => name
            .trim_matches('_')
            .replace("_value", "")
            .split('_')
            .filter(|part| !part.is_empty())
            .map(|part| {
                let mut chars = part.chars();
                match chars.next() {
                    Some(first) => {
                        format!("{}{}", first.to_uppercase(), chars.as_str())
                    }
                    None => String::new(),
                }
            })
            .collect::<Vec<_>>()
            .join(" "),
    }
}

fn audit_detail_attribute_names(detail: &Value) -> Vec<String> {
    let mut names = Vec::new();
    let Some(audit_detail) = detail.get("AuditDetail") else {
        return names;
    };

    for record_key in ["OldValue", "NewValue"] {
        let Some(record) = audit_detail.get(record_key).and_then(Value::as_object) else {
            continue;
        };

        for key in record.keys() {
            if key.starts_with('@') || key.contains('@') {
                continue;
            }

            let associated_navigation_key =
                format!("{key}@Microsoft.Dynamics.CRM.associatednavigationproperty");
            let logical_name = record
                .get(&associated_navigation_key)
                .and_then(Value::as_str)
                .unwrap_or(key);
            let readable = readable_attribute_name(logical_name);
            if !names.iter().any(|item| item == &readable) {
                names.push(readable);
            }
        }
    }

    names
}

async fn retrieve_audit_changed_attributes(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    audit_id: &str,
) -> Vec<String> {
    let path = format!("/audits({audit_id})/Microsoft.Dynamics.CRM.RetrieveAuditDetails");
    let Ok(body) = dataverse_get_with_headers(
        app,
        environment,
        &path,
        &[],
        &[("Prefer", "odata.include-annotations=\"*\"".to_string())],
    )
    .await
    else {
        return Vec::new();
    };

    serde_json::from_str::<Value>(&body)
        .map(|value| audit_detail_attribute_names(&value))
        .unwrap_or_default()
}

fn audit_detail_text(kind: &str, changed_attributes: &[String]) -> String {
    match kind {
        "publish" => "Published web resource".to_string(),
        "create" => "Created web resource".to_string(),
        "delete" => "Deleted web resource".to_string(),
        _ if changed_attributes.is_empty() => "Changed web resource".to_string(),
        _ if changed_attributes.len() == 1 => {
            format!("Changed {}", changed_attributes[0])
        }
        _ => {
            let visible = changed_attributes
                .iter()
                .take(4)
                .cloned()
                .collect::<Vec<_>>()
                .join(", ");
            if changed_attributes.len() > 4 {
                format!(
                    "Changed {visible}, and {} more",
                    changed_attributes.len() - 4
                )
            } else {
                format!("Changed {visible}")
            }
        }
    }
}
pub(super) fn map_resource_type(value: Option<i32>) -> String {
    match value {
        Some(1) => "html",
        Some(2) => "css",
        Some(3) => "js",
        Some(4) => "xml",
        Some(5) | Some(6) | Some(7) | Some(10) | Some(11) => "image",
        Some(12) => "resx",
        _ => "xml",
    }
    .to_string()
}

fn is_binary_resource_type(value: Option<i32>) -> bool {
    matches!(value, Some(5) | Some(6) | Some(7) | Some(10))
}

fn resource_mime_type(resource_type: Option<i32>) -> Option<String> {
    match resource_type {
        Some(1) => Some("text/html"),
        Some(2) => Some("text/css"),
        Some(3) => Some("application/javascript"),
        Some(4) => Some("application/xml"),
        Some(5) => Some("image/png"),
        Some(6) => Some("image/jpeg"),
        Some(7) => Some("image/gif"),
        Some(9) => Some("application/xslt+xml"),
        Some(10) => Some("image/x-icon"),
        Some(11) => Some("image/svg+xml"),
        Some(12) => Some("application/xml"),
        _ => None,
    }
    .map(str::to_string)
}

pub(super) fn resource_type_code(value: &str) -> Result<i32, String> {
    match value {
        "html" => Ok(1),
        "css" => Ok(2),
        "js" => Ok(3),
        "xml" => Ok(4),
        "image" => Ok(11),
        "resx" => Ok(12),
        _ => Err(format!("Unsupported web resource type: {value}")),
    }
}

pub(super) fn is_microsoft_web_resource_name(name: &str) -> bool {
    let lower_name = name.trim().to_lowercase();

    ["msdyn", "microsoft", "mscrm", "mspp", "adx_", "cc_"]
        .iter()
        .any(|prefix| lower_name.starts_with(prefix))
}

pub(super) fn map_resource_language(resource_type: Option<i32>, name: &str) -> String {
    let lower_name = name.to_lowercase();
    match resource_type {
        Some(1) => "html",
        Some(2) => "css",
        Some(3) => {
            if lower_name.ends_with(".ts") {
                "typescript"
            } else {
                "javascript"
            }
        }
        Some(4) => "xml",
        Some(5) | Some(6) | Some(7) | Some(10) => "binary",
        Some(9) => "xml",
        Some(11) => "xml",
        Some(12) => "xml",
        _ if lower_name.ends_with(".json") => "json",
        _ if lower_name.ends_with(".css") => "css",
        _ if lower_name.ends_with(".html") || lower_name.ends_with(".htm") => "html",
        _ if lower_name.ends_with(".xml") || lower_name.ends_with(".resx") => "xml",
        _ => "plaintext",
    }
    .to_string()
}

pub(super) fn web_resource_type_filter() -> String {
    [
        "webresourcetype eq 1",
        "webresourcetype eq 2",
        "webresourcetype eq 3",
        "webresourcetype eq 4",
        "webresourcetype eq 5",
        "webresourcetype eq 6",
        "webresourcetype eq 7",
        "webresourcetype eq 9",
        "webresourcetype eq 10",
        "webresourcetype eq 11",
        "webresourcetype eq 12",
    ]
    .join(" or ")
}

fn web_resource_content_from_api(
    resource: WebResourceContentApiItem,
) -> Result<WebResourceContent, String> {
    let encoded = resource.content.unwrap_or_default();
    let content = if is_binary_resource_type(resource.web_resource_type) {
        encoded
    } else {
        let bytes = if encoded.trim().is_empty() {
            Vec::new()
        } else {
            BASE64
                .decode(encoded)
                .map_err(|error| format!("Decode web resource content: {error}"))?
        };

        String::from_utf8(bytes)
            .map_err(|error| format!("Web resource content is not UTF-8 text: {error}"))?
    };

    Ok(WebResourceContent {
        id: resource.id,
        name: resource.name.clone(),
        resource_type: map_resource_type(resource.web_resource_type),
        language: map_resource_language(resource.web_resource_type, &resource.name),
        content,
        content_encoding: if is_binary_resource_type(resource.web_resource_type) {
            "base64"
        } else {
            "text"
        }
        .to_string(),
        mime_type: resource_mime_type(resource.web_resource_type),
    })
}

fn web_resource_bytes_from_api(resource: &WebResourceContentApiItem) -> Result<Vec<u8>, String> {
    let encoded = resource.content.as_deref().unwrap_or_default();

    if encoded.trim().is_empty() {
        return Ok(Vec::new());
    }

    BASE64
        .decode(encoded)
        .map_err(|error| format!("Decode web resource content: {error}"))
}

fn safe_web_resource_relative_path(name: &str) -> Result<PathBuf, String> {
    let normalized_name = name.trim().replace('\\', "/");
    let normalized = normalized_name
        .split('/')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();

    if normalized.is_empty() {
        return Err("Web resource name did not include a file path.".to_string());
    }

    let mut path = PathBuf::new();
    for part in normalized {
        if part == "." || part == ".." || part.contains(std::path::MAIN_SEPARATOR) {
            return Err(format!(
                "Web resource path contains an unsafe segment: {name}"
            ));
        }
        path.push(part);
    }

    Ok(path)
}

#[tauri::command]
pub(super) async fn list_web_resources(
    app: AppHandle,
    environment: DataverseEnvironment,
    include_managed: bool,
) -> Result<Vec<WebResource>, String> {
    let mut filter = format!("({})", web_resource_type_filter());
    if !include_managed {
        filter.push_str(" and ismanaged eq false");
    }

    let body = dataverse_get(
        &app,
        &environment,
        "/webresourceset",
        &[
            (
                "$select",
                "webresourceid,name,webresourcetype,versionnumber,ismanaged,modifiedon,_modifiedby_value",
            ),
            (
                "$expand",
                "modifiedby($select=systemuserid,fullname,domainname)",
            ),
            ("$filter", &filter),
            ("$orderby", "name asc"),
        ],
    )
    .await?;

    let response: WebResourceApiResponse = serde_json::from_str(&body)
        .map_err(|error| format!("Parse web resources response: {error}"))?;

    Ok(response
        .value
        .into_iter()
        .map(|resource| WebResource {
            id: resource.id,
            name: resource.name,
            resource_type: map_resource_type(resource.web_resource_type),
            version: resource
                .version
                .map(|version| version.to_string())
                .unwrap_or_default(),
            is_managed: resource.is_managed,
            solution: "Dataverse".to_string(),
            modified_on: resource.modified_on,
            modified_by: user_from_api(resource.modified_by, resource.modified_by_id),
        })
        .collect())
}

#[tauri::command]
pub(super) async fn list_web_resource_activity(
    app: AppHandle,
    environment: DataverseEnvironment,
) -> Result<Vec<WebResourceActivity>, String> {
    let body = dataverse_get_with_headers(
        &app,
        &environment,
        "/audits",
        &[
            (
                "$select",
                "auditid,createdon,operation,action,objecttypecode,_objectid_value,_userid_value",
            ),
            ("$filter", "objecttypecode eq 'webresource'"),
            ("$orderby", "createdon desc"),
            ("$top", "30"),
            (
                "$expand",
                "userid($select=systemuserid,fullname,domainname)",
            ),
        ],
        &[("Prefer", "odata.include-annotations=\"*\"".to_string())],
    )
    .await?;
    let response: Value = serde_json::from_str(&body)
        .map_err(|error| format!("Parse web resource activity response: {error}"))?;
    let values = response
        .get("value")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut activities = Vec::new();

    for value in values {
        let Some(id) = json_string(&value, "auditid") else {
            continue;
        };
        let Some(occurred_on) = json_string(&value, "createdon") else {
            continue;
        };

        let operation = formatted_value(&value, "operation")
            .or_else(|| json_i64(&value, "operation").map(|value| operation_label(Some(value))))
            .unwrap_or_else(|| "Activity".to_string());
        let action = formatted_value(&value, "action").unwrap_or_else(|| operation.clone());
        let kind = audit_kind(&action, &operation);
        let changed_attributes = retrieve_audit_changed_attributes(&app, &environment, &id).await;
        let user = value.get("userid");
        let actor_name = user
            .and_then(|item| json_string(item, "fullname"))
            .or_else(|| formatted_value(&value, "_userid_value"))
            .unwrap_or_else(|| "Unknown user".to_string());
        let actor_domain = user.and_then(|item| json_string(item, "domainname"));
        let web_resource_id = json_string(&value, "_objectid_value");
        let web_resource_name = formatted_value(&value, "_objectid_value")
            .or_else(|| web_resource_id.clone())
            .unwrap_or_else(|| "Web resource".to_string());
        let detail = audit_detail_text(&kind, &changed_attributes);

        activities.push(WebResourceActivity {
            id,
            web_resource_id,
            web_resource_name,
            occurred_on,
            actor_name,
            actor_domain,
            action,
            operation,
            kind,
            changed_attributes,
            detail,
        });
    }

    Ok(activities)
}

#[tauri::command]
pub(super) async fn get_web_resource_content(
    app: AppHandle,
    environment: DataverseEnvironment,
    web_resource_id: String,
) -> Result<WebResourceContent, String> {
    let body = dataverse_get(
        &app,
        &environment,
        &format!("/webresourceset({web_resource_id})"),
        &[("$select", "webresourceid,name,webresourcetype,content")],
    )
    .await?;

    let resource: WebResourceContentApiItem = serde_json::from_str(&body)
        .map_err(|error| format!("Parse web resource content response: {error}"))?;
    web_resource_content_from_api(resource)
}

#[tauri::command]
pub(super) async fn download_web_resources(
    app: AppHandle,
    environment: DataverseEnvironment,
    web_resource_ids: Vec<String>,
    target_path: String,
    preserve_paths: bool,
) -> Result<DownloadWebResourcesResult, String> {
    let target_path = PathBuf::from(target_path);
    let mut downloaded = 0usize;

    if preserve_paths {
        fs::create_dir_all(&target_path).map_err(|error| {
            format!(
                "Could not create download folder {}: {error}",
                target_path.display()
            )
        })?;
    } else if web_resource_ids.len() != 1 {
        return Err("Single-file downloads require exactly one web resource.".to_string());
    }

    for web_resource_id in web_resource_ids.iter().filter(|id| !id.trim().is_empty()) {
        let body = dataverse_get(
            &app,
            &environment,
            &format!("/webresourceset({web_resource_id})"),
            &[("$select", "webresourceid,name,webresourcetype,content")],
        )
        .await?;

        let resource: WebResourceContentApiItem = serde_json::from_str(&body)
            .map_err(|error| format!("Parse web resource content response: {error}"))?;
        let bytes = web_resource_bytes_from_api(&resource)?;
        let output_path = if preserve_paths {
            target_path.join(safe_web_resource_relative_path(&resource.name)?)
        } else {
            target_path.clone()
        };

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "Could not create download folder {}: {error}",
                    parent.display()
                )
            })?;
        }

        fs::write(&output_path, bytes)
            .map_err(|error| format!("Could not write {}: {error}", output_path.display()))?;
        downloaded += 1;
    }

    let target_path = target_path.display().to_string();
    Ok(DownloadWebResourcesResult {
        downloaded,
        target_path: target_path.clone(),
        message: format!(
            "Downloaded {downloaded} web resource{} to {target_path}.",
            if downloaded == 1 { "" } else { "s" }
        ),
    })
}

#[tauri::command]
pub(super) async fn delete_web_resources(
    app: AppHandle,
    environment: DataverseEnvironment,
    web_resource_ids: Vec<String>,
) -> Result<DeleteWebResourcesResult, String> {
    let mut deleted = 0usize;

    for web_resource_id in web_resource_ids.iter().filter(|id| !id.trim().is_empty()) {
        dataverse_empty_request(
            &app,
            &environment,
            reqwest::Method::DELETE,
            &format!("/webresourceset({web_resource_id})"),
        )
        .await?;
        deleted += 1;
    }

    Ok(DeleteWebResourcesResult {
        deleted,
        message: format!(
            "Deleted {deleted} web resource{}.",
            if deleted == 1 { "" } else { "s" }
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn web_resource_list_filter_includes_raster_images() {
        let filter = web_resource_type_filter();

        for type_code in [5, 6, 7, 10] {
            assert!(
                filter.contains(&format!("webresourcetype eq {type_code}")),
                "filter should include web resource type {type_code}"
            );
        }
    }

    #[test]
    fn png_content_is_returned_as_base64_without_utf8_decoding() {
        let png_bytes = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
        let encoded = BASE64.encode(png_bytes);
        let content = web_resource_content_from_api(WebResourceContentApiItem {
            id: "image-id".to_string(),
            name: "new_/images/logo.png".to_string(),
            web_resource_type: Some(5),
            content: Some(encoded.clone()),
        })
        .expect("png content should not be decoded as UTF-8");

        assert_eq!(content.resource_type, "image");
        assert_eq!(content.language, "binary");
        assert_eq!(content.content_encoding, "base64");
        assert_eq!(content.mime_type.as_deref(), Some("image/png"));
        assert_eq!(content.content, encoded);
    }

    #[test]
    fn javascript_content_is_returned_as_text() {
        let source = "function onLoad() { return true; }";
        let content = web_resource_content_from_api(WebResourceContentApiItem {
            id: "script-id".to_string(),
            name: "new_/scripts/account.js".to_string(),
            web_resource_type: Some(3),
            content: Some(BASE64.encode(source.as_bytes())),
        })
        .expect("javascript content should decode as UTF-8");

        assert_eq!(content.resource_type, "js");
        assert_eq!(content.language, "javascript");
        assert_eq!(content.content_encoding, "text");
        assert_eq!(content.content, source);
    }
}

pub(super) async fn patch_web_resource_content(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    web_resource_id: &str,
    bytes: &[u8],
) -> Result<(), String> {
    let content = BASE64.encode(bytes);

    dataverse_json_request(
        app,
        environment,
        reqwest::Method::PATCH,
        &format!("/webresourceset({web_resource_id})"),
        &serde_json::json!({ "content": content }),
    )
    .await?;

    Ok(())
}

pub(super) async fn publish_web_resource_by_id(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    web_resource_id: &str,
) -> Result<(), String> {
    let parameter_xml = format!(
    "<importexportxml><webresources><webresource>{web_resource_id}</webresource></webresources></importexportxml>"
  );

    dataverse_json_request(
        app,
        environment,
        reqwest::Method::POST,
        "/PublishXml",
        &serde_json::json!({ "ParameterXml": parameter_xml }),
    )
    .await?;

    Ok(())
}

#[tauri::command]
pub(super) async fn save_web_resource_content(
    app: AppHandle,
    environment: DataverseEnvironment,
    web_resource_id: String,
    web_resource_name: String,
    content: String,
    publish: bool,
) -> Result<PublishResult, String> {
    patch_web_resource_content(&app, &environment, &web_resource_id, content.as_bytes()).await?;

    if publish {
        publish_web_resource_by_id(&app, &environment, &web_resource_id).await?;
    }

    let message = if publish {
        format!("Saved and published {web_resource_name}")
    } else {
        format!("Saved {web_resource_name}")
    };

    Ok(PublishResult {
        web_resource_id,
        web_resource_name,
        message,
    })
}

#[tauri::command]
pub(super) async fn publish_web_resource(
    app: AppHandle,
    environment: DataverseEnvironment,
    binding: WebResourceBinding,
) -> Result<PublishResult, String> {
    let bytes = fs::read(&binding.local_path).map_err(|error| {
        format!(
            "Could not read local file {}: {}",
            binding.local_path, error
        )
    })?;
    patch_web_resource_content(&app, &environment, &binding.web_resource_id, &bytes).await?;
    publish_web_resource_by_id(&app, &environment, &binding.web_resource_id).await?;

    Ok(PublishResult {
        web_resource_id: binding.web_resource_id,
        web_resource_name: binding.web_resource_name.clone(),
        message: format!("Published {}", binding.web_resource_name),
    })
}
