use super::{
    domain::{
        create_ai_tool_message, emit_ai_chat_message, mark_ai_message_status, user_safe_ai_error,
    },
    AiChatMessage, AiGetRequest, AiMutationRequest, AiProviderToolRequest,
};
use crate::backend::{
    dataverse::{access_token_for, api_url, dataverse_get, validate_logical_name},
    storage::DataverseEnvironment,
};
use reqwest::Client;
use serde_json::Value;
use tauri::AppHandle;
use url::{form_urlencoded, Url};

const AI_DEFAULT_TOP: u32 = 25;
const AI_MAX_TOP: u32 = 100;
const AI_MAX_RESPONSE_BYTES: usize = 1_000_000;

fn is_sensitive_json_key(key: &str) -> bool {
    let lower = key.to_lowercase();
    lower == "authorization"
        || lower == "access_token"
        || lower == "refresh_token"
        || lower == "id_token"
        || lower == "client_secret"
        || lower.ends_with("token")
}

fn sanitize_json_value(value: Value) -> Value {
    match value {
        Value::Array(values) => Value::Array(values.into_iter().map(sanitize_json_value).collect()),
        Value::Object(map) => Value::Object(
            map.into_iter()
                .filter_map(|(key, value)| {
                    if is_sensitive_json_key(&key) {
                        None
                    } else {
                        Some((key, sanitize_json_value(value)))
                    }
                })
                .collect(),
        ),
        other => other,
    }
}

fn parse_dataverse_json(body: &str) -> Result<Value, String> {
    if body.len() > AI_MAX_RESPONSE_BYTES {
        return Err(format!(
            "Dataverse response exceeded the {} byte AI Chat limit. Narrow the query and try again.",
            AI_MAX_RESPONSE_BYTES
        ));
    }

    serde_json::from_str::<Value>(body)
        .map(sanitize_json_value)
        .map_err(|error| format!("Parse Dataverse JSON response: {error}"))
}

fn is_allowed_ai_query_option(key: &str) -> bool {
    matches!(
        key,
        "$select" | "$filter" | "$orderby" | "$expand" | "$count" | "$top" | "$skiptoken"
    )
}

pub(super) fn normalize_ai_get_request(input: &str) -> Result<AiGetRequest, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("A Dataverse API path is required.".to_string());
    }

    if trimmed.starts_with("//") || Url::parse(trimmed).is_ok() {
        return Err("Absolute URLs are not allowed for AI Chat Dataverse GET.".to_string());
    }

    if trimmed.contains('#') || trimmed.contains('\\') {
        return Err(
            "Fragments and backslashes are not allowed in Dataverse GET paths.".to_string(),
        );
    }

    let without_slash = trimmed.trim_start_matches('/');
    let relative = if let Some(rest) = without_slash.strip_prefix("api/data/v9.2/") {
        rest
    } else if without_slash.starts_with("api/data/") {
        return Err("Only Dataverse Web API v9.2 paths are allowed.".to_string());
    } else {
        without_slash
    };

    let (raw_path, raw_query) = relative
        .split_once('?')
        .map_or((relative, ""), |(path, query)| (path, query));
    let raw_path = raw_path.trim().trim_start_matches('/');
    let lower_path = raw_path.to_lowercase();

    if raw_path.is_empty() {
        return Err("A Dataverse API path is required.".to_string());
    }

    if lower_path.starts_with("$batch") || lower_path.starts_with("$metadata") {
        return Err("This AI Chat command only supports JSON GET endpoints.".to_string());
    }

    let rejected_terms = [
        "publishxml",
        "importsolution",
        "execute",
        "delete",
        "create",
        "update",
        "assign",
        "associate",
        "disassociate",
        "merge",
        "setstate",
        "qualify",
        "win",
        "lose",
        "cancel",
        "close",
        "microsoft.dynamics.crm.",
    ];

    if rejected_terms.iter().any(|term| lower_path.contains(term)) {
        return Err(
            "Dataverse actions and mutating endpoints are not available in AI Chat.".to_string(),
        );
    }

    let mut query: Vec<(String, String)> = Vec::new();
    let mut has_top = false;

    if !raw_query.trim().is_empty() {
        for (key, value) in form_urlencoded::parse(raw_query.as_bytes()) {
            let key = key.into_owned();
            let value = value.into_owned();

            if !is_allowed_ai_query_option(&key) {
                return Err(format!(
                    "Query option {key} is not allowed for AI Chat Dataverse GET."
                ));
            }

            if key == "$top" {
                let parsed_top = value
                    .parse::<u32>()
                    .map_err(|_| "$top must be a positive integer.".to_string())?;
                let capped_top = parsed_top.clamp(1, AI_MAX_TOP);
                query.push((key, capped_top.to_string()));
                has_top = true;
            } else {
                query.push((key, value));
            }
        }
    }

    if !has_top {
        query.push(("$top".to_string(), AI_DEFAULT_TOP.to_string()));
    }

    Ok(AiGetRequest {
        path: format!("/{raw_path}"),
        query,
    })
}

fn ai_get_display_path(request: &AiGetRequest) -> String {
    if request.query.is_empty() {
        return request.path.clone();
    }

    let query = request
        .query
        .iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("&");

    format!("{}?{query}", request.path)
}

async fn dataverse_ai_whoami_value(
    app: &AppHandle,
    environment: &DataverseEnvironment,
) -> Result<Value, String> {
    let body = dataverse_get(app, environment, "/WhoAmI", &[])
        .await
        .map_err(user_safe_ai_error)?;

    parse_dataverse_json(&body).map_err(user_safe_ai_error)
}

async fn dataverse_ai_list_entity_sets_value(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    search: Option<String>,
) -> Result<Value, String> {
    let body = dataverse_get(
        app,
        environment,
        "/EntityDefinitions",
        &[("$select", "LogicalName,EntitySetName,DisplayName")],
    )
    .await
    .map_err(user_safe_ai_error)?;
    let mut value = parse_dataverse_json(&body).map_err(user_safe_ai_error)?;
    let search = search
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty());

    if let Some(items) = value.get_mut("value").and_then(Value::as_array_mut) {
        if let Some(search) = search {
            items.retain(|item| item.to_string().to_lowercase().contains(&search));
        }

        if items.len() > 100 {
            items.truncate(100);
        }
    }

    Ok(value)
}

async fn dataverse_ai_metadata_value(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    logical_name: Option<String>,
) -> Result<Value, String> {
    let (path, query) = if let Some(logical_name) = logical_name {
        let logical_name = validate_logical_name(&logical_name)?;
        (
            format!("/EntityDefinitions(LogicalName='{logical_name}')"),
            vec![
                (
                    "$select",
                    "LogicalName,EntitySetName,PrimaryNameAttribute,PrimaryIdAttribute,OwnershipType,DisplayName,Description",
                ),
                (
                    "$expand",
                    "Attributes($select=LogicalName,AttributeType,DisplayName,RequiredLevel,IsValidForRead;$top=75)",
                ),
            ],
        )
    } else {
        (
            "/EntityDefinitions".to_string(),
            vec![
                (
                    "$select",
                    "LogicalName,EntitySetName,PrimaryNameAttribute,PrimaryIdAttribute,OwnershipType,DisplayName",
                ),
                ("$top", "25"),
            ],
        )
    };

    let body = dataverse_get(app, environment, &path, &query)
        .await
        .map_err(user_safe_ai_error)?;

    parse_dataverse_json(&body).map_err(user_safe_ai_error)
}

async fn dataverse_ai_get_value(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    input_path: &str,
) -> Result<(Value, String), String> {
    let request = normalize_ai_get_request(input_path)?;
    let query_refs = request
        .query
        .iter()
        .map(|(key, value)| (key.as_str(), value.as_str()))
        .collect::<Vec<_>>();
    let body = dataverse_get(app, environment, &request.path, &query_refs)
        .await
        .map_err(user_safe_ai_error)?;
    let value = parse_dataverse_json(&body).map_err(user_safe_ai_error)?;
    let display_path = ai_get_display_path(&request);

    Ok((value, display_path))
}

fn normalize_ai_mutation_path(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("A Dataverse mutation path is required.".to_string());
    }

    if trimmed.starts_with("//") || Url::parse(trimmed).is_ok() {
        return Err("Absolute URLs are not allowed for AI Agent Dataverse mutations.".to_string());
    }

    if trimmed.contains('#') || trimmed.contains('\\') {
        return Err("Fragments and backslashes are not allowed in mutation paths.".to_string());
    }

    if trimmed.chars().any(char::is_whitespace) {
        return Err(
            "Whitespace is not allowed in mutation paths. URL-encode values first.".to_string(),
        );
    }

    let without_slash = trimmed.trim_start_matches('/');
    let relative = if let Some(rest) = without_slash.strip_prefix("api/data/v9.2/") {
        rest
    } else if without_slash.starts_with("api/data/") {
        return Err("Only Dataverse Web API v9.2 paths are allowed.".to_string());
    } else {
        without_slash
    };
    let path = relative.trim_start_matches('/');
    let lower_path = path.to_lowercase();

    if path.is_empty() {
        return Err("A Dataverse mutation path is required.".to_string());
    }

    if lower_path.starts_with("$batch") || lower_path.starts_with("$metadata") {
        return Err("$batch and $metadata are not available to AI Agent mutations.".to_string());
    }

    Ok(format!("/{path}"))
}

fn normalize_ai_mutation_request(arguments: &Value) -> Result<AiMutationRequest, String> {
    let method_label = ai_tool_argument(arguments, "method")
        .ok_or_else(|| "dataverse_mutate requires a method argument.".to_string())?
        .to_uppercase();
    let method = match method_label.as_str() {
        "POST" => reqwest::Method::POST,
        "PATCH" => reqwest::Method::PATCH,
        "DELETE" => reqwest::Method::DELETE,
        _ => return Err("dataverse_mutate method must be POST, PATCH, or DELETE.".to_string()),
    };
    let path = normalize_ai_mutation_path(
        &ai_tool_argument(arguments, "path")
            .ok_or_else(|| "dataverse_mutate requires a path argument.".to_string())?,
    )?;
    let body_json = ai_tool_argument(arguments, "bodyJson");
    let payload = if method_label == "DELETE" {
        if body_json.is_some() {
            return Err("DELETE mutations must not include bodyJson.".to_string());
        }
        None
    } else {
        let body_json = body_json.unwrap_or_else(|| "{}".to_string());
        let payload = serde_json::from_str::<Value>(&body_json)
            .map_err(|error| format!("bodyJson must be valid JSON: {error}"))?;

        if !payload.is_object() {
            return Err("bodyJson must be a JSON object. Use {} for no parameters.".to_string());
        }

        Some(payload)
    };

    Ok(AiMutationRequest {
        method,
        method_label,
        path,
        payload,
    })
}

fn mutation_display_from_arguments(arguments: &Value) -> Option<String> {
    let method = ai_tool_argument(arguments, "method")?.to_uppercase();
    let path = ai_tool_argument(arguments, "path")?;
    Some(format!("{method} {path}"))
}

async fn dataverse_ai_mutate_value(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    arguments: &Value,
) -> Result<(Value, String), String> {
    let request = normalize_ai_mutation_request(arguments)?;
    let access_token = access_token_for(app, environment)
        .await
        .map_err(user_safe_ai_error)?;
    let client = Client::new();
    let mut builder = client
        .request(
            request.method.clone(),
            api_url(&environment.url, &request.path),
        )
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .header("OData-MaxVersion", "4.0")
        .header("OData-Version", "4.0");

    if request.method_label == "PATCH" || request.method_label == "DELETE" {
        builder = builder.header("If-Match", "*");
    }

    if let Some(payload) = &request.payload {
        builder = builder
            .header("Content-Type", "application/json")
            .json(payload);
    }

    let response = builder
        .send()
        .await
        .map_err(|error| user_safe_ai_error(error.to_string()))?;
    let status = response.status();
    let entity_id = response
        .headers()
        .get("OData-EntityId")
        .or_else(|| response.headers().get("odata-entityid"))
        .and_then(|value| value.to_str().ok())
        .map(ToString::to_string);
    let body = response
        .text()
        .await
        .map_err(|error| user_safe_ai_error(error.to_string()))?;

    if !status.is_success() {
        return Err(user_safe_ai_error(format!(
            "Dataverse mutation failed ({status}): {body}"
        )));
    }

    let mut result = serde_json::json!({
      "method": request.method_label,
      "path": request.path,
      "status": status.as_u16(),
    });

    if let Some(entity_id) = entity_id {
        if let Some(object) = result.as_object_mut() {
            object.insert("entityId".to_string(), Value::String(entity_id));
        }
    }

    if !body.trim().is_empty() {
        let body_value = serde_json::from_str::<Value>(&body)
            .map(sanitize_json_value)
            .unwrap_or_else(|_| Value::String(body));

        if let Some(object) = result.as_object_mut() {
            object.insert("body".to_string(), body_value);
        }
    }

    let display = format!("{} {}", request.method_label, request.path);
    Ok((result, display))
}

fn ai_tool_argument(arguments: &Value, name: &str) -> Option<String> {
    arguments
        .get(name)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

pub(super) async fn execute_ai_tool_request(
    app: &AppHandle,
    thread_id: &str,
    environment: &DataverseEnvironment,
    request: &AiProviderToolRequest,
    allow_mutations: bool,
) -> Result<(AiChatMessage, Value), String> {
    let arguments = if request.arguments.is_object() {
        request.arguments.clone()
    } else {
        serde_json::json!({})
    };

    let initial_display = match request.name.as_str() {
        "dataverse_whoami" => "GET /WhoAmI".to_string(),
        "dataverse_list_entity_sets" => "GET /EntityDefinitions".to_string(),
        "dataverse_metadata" => ai_tool_argument(&arguments, "logicalName")
            .map(|name| format!("GET /EntityDefinitions(LogicalName='{name}')"))
            .unwrap_or_else(|| "GET /EntityDefinitions".to_string()),
        "dataverse_get" => ai_tool_argument(&arguments, "path")
            .map(|path| format!("GET {path}"))
            .unwrap_or_else(|| "dataverse_get".to_string()),
        "dataverse_mutate" => {
            let method = ai_tool_argument(&arguments, "method")
                .unwrap_or_else(|| "POST".to_string())
                .to_uppercase();
            let path = ai_tool_argument(&arguments, "path")
                .unwrap_or_else(|| "dataverse_mutate".to_string());
            format!("{method} {path}")
        }
        _ => request.name.clone(),
    };
    let pending_message = create_ai_tool_message(
        &request.name,
        initial_display,
        "streaming",
        Some(serde_json::json!({ "arguments": arguments })),
    )?;
    emit_ai_chat_message(app, thread_id, &pending_message);

    let result = match request.name.as_str() {
        "dataverse_whoami" => {
            let value = dataverse_ai_whoami_value(app, environment).await;
            (
                "GET /WhoAmI".to_string(),
                value.map(|value| (value, "GET /WhoAmI".to_string())),
            )
        }
        "dataverse_list_entity_sets" => {
            let search = ai_tool_argument(&arguments, "search");
            let value = dataverse_ai_list_entity_sets_value(app, environment, search).await;
            (
                "GET /EntityDefinitions".to_string(),
                value.map(|value| (value, "GET /EntityDefinitions".to_string())),
            )
        }
        "dataverse_metadata" => {
            let logical_name = ai_tool_argument(&arguments, "logicalName");
            let display_path = logical_name
                .as_ref()
                .map(|name| format!("GET /EntityDefinitions(LogicalName='{name}')"))
                .unwrap_or_else(|| "GET /EntityDefinitions".to_string());
            let value = dataverse_ai_metadata_value(app, environment, logical_name).await;
            (
                display_path.clone(),
                value.map(|value| (value, display_path)),
            )
        }
        "dataverse_get" => {
            let path = ai_tool_argument(&arguments, "path")
                .ok_or_else(|| "dataverse_get requires a path argument.".to_string());
            match path {
                Ok(path) => {
                    let value = dataverse_ai_get_value(app, environment, &path).await;
                    (
                        format!("GET {path}"),
                        value.map(|(value, display_path)| (value, format!("GET {display_path}"))),
                    )
                }
                Err(error) => (request.name.clone(), Err(error)),
            }
        }
        "dataverse_mutate" => {
            if !allow_mutations {
                (
                    request.name.clone(),
                    Err(
                        "Dataverse mutations are only available in AI Agent (Experimental)."
                            .to_string(),
                    ),
                )
            } else {
                let value = dataverse_ai_mutate_value(app, environment, &arguments).await;
                let fallback_display = mutation_display_from_arguments(&arguments)
                    .unwrap_or_else(|| request.name.clone());
                (fallback_display.clone(), value)
            }
        }
        _ => (
            request.name.clone(),
            Err("Unknown Dataverse AI tool requested by the AI provider.".to_string()),
        ),
    };

    let (fallback_display, result) = result;
    match result {
        Ok((value, display)) => {
            let mut message = mark_ai_message_status(&pending_message, "complete");
            message.content = display;
            emit_ai_chat_message(app, thread_id, &message);

            Ok((
                message,
                serde_json::json!({
                  "name": request.name,
                  "arguments": arguments,
                  "ok": true,
                  "result": value,
                }),
            ))
        }
        Err(error) => {
            let mut message = mark_ai_message_status(&pending_message, "error");
            message.content = fallback_display;
            emit_ai_chat_message(app, thread_id, &message);

            Ok((
                message,
                serde_json::json!({
                  "name": request.name,
                  "arguments": arguments,
                  "ok": false,
                  "error": error,
                }),
            ))
        }
    }
}
