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

fn web_resource_type_filter() -> String {
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
                "webresourceid,name,webresourcetype,versionnumber,ismanaged",
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
        })
        .collect())
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
