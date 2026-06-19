use base64::{
    engine::general_purpose::{STANDARD as BASE64, URL_SAFE_NO_PAD},
    Engine as _,
};
use clrmeta::{Metadata, ResolvedType};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::{
    collections::{HashMap, HashSet},
    env, fs,
    io::{BufRead, BufReader, Read, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};
use url::{form_urlencoded, Url};
use uuid::Uuid;

mod ai;
mod auth;
mod fetchxml;
mod plugins;
mod solutions;
mod web_resources;

const CONFIG_FILE_NAME: &str = "config.json";
const USER_SETTINGS_FILE_NAME: &str = "user-settings.json";
const APP_HOME_DIR_NAME: &str = ".openDataverse";
const LEGACY_APP_HOME_DIR_NAME: &str = ".OpenDataverse";
const TOKENS_DIR_NAME: &str = "tokens";
const AI_CHATS_DIR_NAME: &str = "ai-chats";
const CLIENT_ID: &str = "51f81489-12ee-4a9e-aaae-a2591f45987d";
const AUTHORITY_BASE: &str = "https://login.microsoftonline.com/common";
const REDIRECT_URI: &str = "http://localhost:8400";
const AI_DEFAULT_TOP: u32 = 25;
const AI_MAX_TOP: u32 = 100;
const AI_MAX_RESPONSE_BYTES: usize = 1_000_000;
const AI_TOOL_REQUESTS_PER_ROUND: usize = 8;
const AI_MAX_TOOL_ROUNDS: usize = 32;
const AI_ATTACHMENT_MAX_SELECTED_PATHS: usize = 24;
const AI_ATTACHMENT_MAX_FOLDER_FILES: usize = 80;
const AI_ATTACHMENT_MAX_TEXT_FILE_BYTES: u64 = 1_000_000;
const AI_ATTACHMENT_MAX_TEXT_CHARS_PER_FILE: usize = 12_000;
const AI_ATTACHMENT_MAX_TOTAL_CONTEXT_CHARS: usize = 80_000;
const AI_ATTACHMENT_MAX_CODEX_IMAGES: usize = 6;
const AI_PASTED_IMAGES_DIR_NAME: &str = "ai-chat-pasted-images";
const AI_PASTED_IMAGE_MAX_BYTES: usize = 15_000_000;
const AI_CHAT_EVENT: &str = "ai-chat-event";
const AI_DEFAULT_PROVIDER: &str = "codex";
const AI_DEFAULT_MODEL: &str = "gpt-5.3-codex-spark";
const AI_DEFAULT_REASONING_EFFORT: &str = "medium";
const AI_DEFAULT_CLAUDE_MODEL: &str = "claude-sonnet-4-6";
const AI_DEFAULT_CLAUDE_REASONING_EFFORT: &str = "medium";
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DataverseEnvironment {
    id: String,
    name: String,
    url: String,
    auth_state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    token_output_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebResourceBinding {
    id: String,
    environment_id: String,
    local_path: String,
    web_resource_name: String,
    web_resource_id: String,
    last_known_version: String,
    auto_publish: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
    current_environment_id: Option<String>,
    publisher_prefix: String,
    environments: Vec<DataverseEnvironment>,
    bindings: Vec<WebResourceBinding>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            current_environment_id: None,
            publisher_prefix: "new".to_string(),
            environments: Vec::new(),
            bindings: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppearanceSettings {
    #[serde(default)]
    dark_mode: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UserSettings {
    #[serde(default)]
    appearance: AppearanceSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthSession {
    environment_id: String,
    status: String,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserAuthStart {
    session_id: String,
    auth_url: String,
    redirect_uri: String,
    expires_at: i64,
}

#[derive(Debug, Clone)]
struct PendingBrowserAuth {
    environment_id: String,
    code_verifier: String,
    result: Arc<Mutex<Option<Result<AuthCodeResult, String>>>>,
    expires_at: i64,
}

#[derive(Debug, Clone)]
struct AuthCodeResult {
    code: String,
    state: String,
}

#[derive(Default)]
struct PendingAuthState {
    sessions: Mutex<HashMap<String, PendingBrowserAuth>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredToken {
    access_token: String,
    refresh_token: Option<String>,
    expires_at: i64,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WhoAmIResponse {
    #[serde(rename = "UserId")]
    user_id: String,
}

fn now_unix() -> Result<i64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .map_err(|error| error.to_string())
}

fn now_rfc3339() -> Result<String, String> {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(|error| error.to_string())
}

fn normalize_org_url(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

fn auth_scope(org_url: &str) -> String {
    format!("{}/.default offline_access", normalize_org_url(org_url))
}

fn create_code_verifier() -> String {
    format!(
        "{}{}{}",
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple()
    )
}

fn create_code_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn read_auth_code_request(mut stream: std::net::TcpStream) -> Result<AuthCodeResult, String> {
    let mut buffer = [0_u8; 8192];
    let bytes_read = stream
        .read(&mut buffer)
        .map_err(|error| error.to_string())?;
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let request_line = request
        .lines()
        .next()
        .ok_or_else(|| "Browser redirect request was empty".to_string())?;
    let path = request_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| "Browser redirect request was malformed".to_string())?;
    let redirect_url =
        Url::parse(&format!("{REDIRECT_URI}{path}")).map_err(|error| error.to_string())?;

    let mut code = None;
    let mut state = None;
    let mut error = None;
    let mut error_description = None;

    for (key, value) in redirect_url.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.into_owned()),
            "state" => state = Some(value.into_owned()),
            "error" => error = Some(value.into_owned()),
            "error_description" => error_description = Some(value.into_owned()),
            _ => {}
        }
    }

    let response_html = if error.is_some() {
        "<html><body><h1>OpenDataverse sign-in failed</h1><p>You can return to OpenDataverse.</p></body></html>"
    } else {
        "<html><body><h1>OpenDataverse sign-in complete</h1><p>You can return to OpenDataverse.</p></body></html>"
    };

    let response = format!(
    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
    response_html.len(),
    response_html
  );
    let _ = stream.write_all(response.as_bytes());

    if let Some(error) = error {
        return Err(format!(
            "{}: {}",
            error,
            error_description.unwrap_or_default()
        ));
    }

    Ok(AuthCodeResult {
        code: code.ok_or_else(|| "Browser redirect did not include an auth code".to_string())?,
        state: state.ok_or_else(|| "Browser redirect did not include state".to_string())?,
    })
}

fn api_url(org_url: &str, path: &str) -> String {
    format!("{}/api/data/v9.2{}", normalize_org_url(org_url), path)
}

fn opendataverse_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .home_dir()
        .map_err(|error| error.to_string())?
        .join(APP_HOME_DIR_NAME);
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn legacy_opendataverse_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .home_dir()
        .map_err(|error| error.to_string())?
        .join(LEGACY_APP_HOME_DIR_NAME))
}

fn legacy_app_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|error| error.to_string())
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = opendataverse_dir(app)?;
    Ok(dir.join(CONFIG_FILE_NAME))
}

fn legacy_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(legacy_app_config_dir(app)?.join(CONFIG_FILE_NAME))
}

fn legacy_home_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(legacy_opendataverse_dir(app)?.join(CONFIG_FILE_NAME))
}

fn user_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = opendataverse_dir(app)?;
    Ok(dir.join(USER_SETTINGS_FILE_NAME))
}

fn token_path(app: &AppHandle, environment_id: &str) -> Result<PathBuf, String> {
    let dir = opendataverse_dir(app)?.join(TOKENS_DIR_NAME);
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join(format!("token-{}.json", environment_id)))
}

fn legacy_home_token_path(app: &AppHandle, environment_id: &str) -> Result<PathBuf, String> {
    Ok(legacy_opendataverse_dir(app)?
        .join(TOKENS_DIR_NAME)
        .join(format!("token-{}.json", environment_id)))
}

fn legacy_token_path(app: &AppHandle, environment_id: &str) -> Result<PathBuf, String> {
    Ok(legacy_app_config_dir(app)?
        .join(TOKENS_DIR_NAME)
        .join(format!("token-{}.json", environment_id)))
}

fn safe_storage_segment(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    let trimmed = sanitized.trim_matches('_');

    if trimmed.is_empty() {
        "unknown".to_string()
    } else {
        trimmed.to_string()
    }
}

fn save_token(app: &AppHandle, environment_id: &str, token: &StoredToken) -> Result<(), String> {
    let path = token_path(app, environment_id)?;
    let data = serde_json::to_string_pretty(token).map_err(|error| error.to_string())?;
    fs::write(path, data).map_err(|error| error.to_string())
}

fn load_token(app: &AppHandle, environment_id: &str) -> Result<StoredToken, String> {
    let path = token_path(app, environment_id)?;
    let data = match fs::read_to_string(&path) {
        Ok(data) => data,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let legacy_home_path = legacy_home_token_path(app, environment_id)?;
            if legacy_home_path.exists() {
                let legacy_data =
                    fs::read_to_string(&legacy_home_path).map_err(|error| error.to_string())?;
                fs::write(&path, &legacy_data).map_err(|write_error| write_error.to_string())?;
                return serde_json::from_str(&legacy_data).map_err(|error| error.to_string());
            }

            let legacy_path = legacy_token_path(app, environment_id)?;
            let legacy_data = fs::read_to_string(&legacy_path).map_err(|legacy_error| {
                format!(
                    "Token was not found at {} or {}: {}",
                    path.display(),
                    legacy_path.display(),
                    legacy_error
                )
            })?;
            fs::write(&path, &legacy_data).map_err(|write_error| write_error.to_string())?;
            legacy_data
        }
        Err(error) => return Err(error.to_string()),
    };

    serde_json::from_str(&data).map_err(|error| error.to_string())
}

fn token_from_response(response: TokenResponse) -> Result<StoredToken, String> {
    if let Some(error) = response.error {
        return Err(format!(
            "{}: {}",
            error,
            response.error_description.unwrap_or_default()
        ));
    }

    let access_token = response
        .access_token
        .ok_or_else(|| "Token response did not include an access token".to_string())?;
    let expires_in = response.expires_in.unwrap_or(3600);

    Ok(StoredToken {
        access_token,
        refresh_token: response.refresh_token,
        expires_at: now_unix()? + expires_in,
    })
}

async fn refresh_token(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    token: &StoredToken,
) -> Result<StoredToken, String> {
    let refresh_token = token
        .refresh_token
        .clone()
        .ok_or_else(|| "No refresh token is available. Sign in again.".to_string())?;

    let client = Client::new();
    let response = client
        .post(format!("{AUTHORITY_BASE}/oauth2/v2.0/token"))
        .form(&[
            ("client_id", CLIENT_ID.to_string()),
            ("grant_type", "refresh_token".to_string()),
            ("refresh_token", refresh_token),
            ("scope", auth_scope(&environment.url)),
        ])
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("Token refresh failed ({status}): {body}"));
    }

    let mut refreshed = token_from_response(
        serde_json::from_str(&body).map_err(|error| format!("Parse token response: {error}"))?,
    )?;
    if refreshed.refresh_token.is_none() {
        refreshed.refresh_token = token.refresh_token.clone();
    }

    save_token(app, &environment.id, &refreshed)?;
    Ok(refreshed)
}

async fn access_token_for(
    app: &AppHandle,
    environment: &DataverseEnvironment,
) -> Result<String, String> {
    let token = load_token(app, &environment.id)?;
    if now_unix()? + 300 < token.expires_at {
        return Ok(token.access_token);
    }

    refresh_token(app, environment, &token)
        .await
        .map(|token| token.access_token)
}

async fn dataverse_get(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    path: &str,
    query: &[(&str, &str)],
) -> Result<String, String> {
    let access_token = access_token_for(app, environment).await?;
    let client = Client::new();
    let response = client
        .get(api_url(&environment.url, path))
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .header("OData-MaxVersion", "4.0")
        .header("OData-Version", "4.0")
        .query(query)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("Dataverse GET failed ({status}): {body}"));
    }

    Ok(body)
}

async fn dataverse_json_request<T: Serialize + ?Sized>(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    method: reqwest::Method,
    path: &str,
    payload: &T,
) -> Result<(), String> {
    let access_token = access_token_for(app, environment).await?;
    let client = Client::new();
    let response = client
        .request(method, api_url(&environment.url, path))
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("OData-MaxVersion", "4.0")
        .header("OData-Version", "4.0")
        .header("If-Match", "*")
        .json(payload)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("Dataverse request failed ({status}): {body}"));
    }

    Ok(())
}

async fn dataverse_empty_request(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    method: reqwest::Method,
    path: &str,
) -> Result<(), String> {
    let access_token = access_token_for(app, environment).await?;
    let client = Client::new();
    let response = client
        .request(method, api_url(&environment.url, path))
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .header("OData-MaxVersion", "4.0")
        .header("OData-Version", "4.0")
        .header("If-Match", "*")
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("Dataverse request failed ({status}): {body}"));
    }

    Ok(())
}

async fn dataverse_post_json_with_headers<T: Serialize + ?Sized>(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    path: &str,
    payload: &T,
    headers: &[(&str, String)],
) -> Result<(String, Option<String>), String> {
    let access_token = access_token_for(app, environment).await?;
    let client = Client::new();
    let mut request = client
        .post(api_url(&environment.url, path))
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("OData-MaxVersion", "4.0")
        .header("OData-Version", "4.0")
        .header("If-None-Match", "null")
        .json(payload);

    for (name, value) in headers {
        request = request.header(*name, value);
    }

    let response = request.send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    let entity_id = response
        .headers()
        .get("OData-EntityId")
        .or_else(|| response.headers().get("odata-entityid"))
        .and_then(|value| value.to_str().ok())
        .map(ToString::to_string);
    let body = response.text().await.map_err(|error| error.to_string())?;

    if !status.is_success() {
        return Err(format!("Dataverse request failed ({status}): {body}"));
    }

    Ok((body, entity_id))
}

async fn dataverse_get_json_value(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    path: &str,
    query: &[(&str, &str)],
) -> Result<Value, String> {
    let body = dataverse_get(app, environment, path, query).await?;
    serde_json::from_str(&body).map_err(|error| format!("Parse Dataverse JSON response: {error}"))
}

fn normalize_dataverse_next_link(
    environment: &DataverseEnvironment,
    next_link: &str,
) -> Result<(String, Vec<(String, String)>), String> {
    let parsed = Url::parse(next_link).map_err(|error| error.to_string())?;
    let org_url =
        Url::parse(&normalize_org_url(&environment.url)).map_err(|error| error.to_string())?;

    if parsed.scheme() != org_url.scheme()
        || parsed.host_str() != org_url.host_str()
        || parsed.port_or_known_default() != org_url.port_or_known_default()
    {
        return Err("Dataverse nextLink did not match the selected environment.".to_string());
    }

    let api_prefix = "/api/data/v9.2";
    let path = parsed
        .path()
        .strip_prefix(api_prefix)
        .ok_or_else(|| "Dataverse nextLink used an unexpected API path.".to_string())?;
    let query = parsed
        .query_pairs()
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();

    Ok((format!("/{}", path.trim_start_matches('/')), query))
}

async fn dataverse_get_collection_values(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    path: &str,
    query: Vec<(String, String)>,
) -> Result<Vec<Value>, String> {
    let mut values = Vec::new();
    let mut current_path = path.to_string();
    let mut current_query = query;

    for _ in 0..30 {
        let query_refs = current_query
            .iter()
            .map(|(key, value)| (key.as_str(), value.as_str()))
            .collect::<Vec<_>>();
        let page = dataverse_get_json_value(app, environment, &current_path, &query_refs).await?;

        if let Some(items) = page.get("value").and_then(Value::as_array) {
            values.extend(items.iter().cloned());
        }

        let Some(next_link) = page.get("@odata.nextLink").and_then(Value::as_str) else {
            return Ok(values);
        };
        let (next_path, next_query) = normalize_dataverse_next_link(environment, next_link)?;
        current_path = next_path;
        current_query = next_query;
    }

    Err("Dataverse paging exceeded the metadata page limit.".to_string())
}

fn json_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn json_bool(value: &Value, key: &str) -> Option<bool> {
    value.get(key).and_then(|item| {
        item.as_bool()
            .or_else(|| item.get("Value").and_then(Value::as_bool))
    })
}

fn json_i32(value: &Value, key: &str) -> Option<i32> {
    value
        .get(key)
        .and_then(Value::as_i64)
        .and_then(|item| i32::try_from(item).ok())
}

fn json_i64(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(Value::as_i64)
}

fn json_lookup_id(value: &Value, key: &str) -> Option<String> {
    json_string(value, key).or_else(|| json_string(value, &format!("_{key}_value")))
}

fn json_expanded_string(value: &Value, navigation: &str, key: &str) -> Option<String> {
    value
        .get(navigation)
        .and_then(|item| json_string(item, key))
}

fn localized_label(value: &Value, key: &str, fallback: &str) -> String {
    value
        .get(key)
        .and_then(|display_name| {
            display_name
                .get("UserLocalizedLabel")
                .and_then(|label| label.get("Label"))
                .and_then(Value::as_str)
                .or_else(|| {
                    display_name
                        .get("LocalizedLabels")
                        .and_then(Value::as_array)
                        .and_then(|labels| labels.first())
                        .and_then(|label| label.get("Label"))
                        .and_then(Value::as_str)
                })
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| fallback.to_string())
}

fn odata_string_literal(value: &str) -> String {
    value.replace('\'', "''")
}

fn guid_from_entity_id(value: &str) -> Option<String> {
    let start = value.rfind('(')? + 1;
    let end = value.rfind(')')?;
    (start < end).then(|| value[start..end].to_string())
}

fn validate_logical_name(value: &str) -> Result<String, String> {
    let trimmed = value
        .trim()
        .trim_matches(|ch: char| ch == '\'' || ch == '"' || ch == '`');
    let mut chars = trimmed.chars();
    let first = chars
        .next()
        .ok_or_else(|| "Logical name is required.".to_string())?;

    if !(first.is_ascii_alphabetic() || first == '_') {
        return Err("Logical name must start with a letter or underscore.".to_string());
    }

    if !chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_') {
        return Err("Logical name can contain only letters, numbers, and underscores.".to_string());
    }

    if trimmed.len() > 128 {
        return Err("Logical name is too long.".to_string());
    }

    Ok(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_storage_segment_removes_path_characters() {
        assert_eq!(safe_storage_segment("../environment/id"), "environment_id");
        assert_eq!(safe_storage_segment(""), "unknown");
    }
}

pub(crate) fn run() {
    tauri::Builder::default()
        .manage(PendingAuthState::default())
        .manage(ai::AiChatState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth::load_config,
            auth::save_config,
            auth::load_user_settings,
            auth::save_user_settings,
            auth::start_browser_auth,
            auth::complete_browser_auth,
            auth::check_dataverse_connection,
            web_resources::list_web_resources,
            web_resources::get_web_resource_content,
            web_resources::save_web_resource_content,
            web_resources::publish_web_resource,
            solutions::list_solutions,
            solutions::list_solution_components,
            solutions::get_solution_component_dependencies,
            solutions::get_solution_component_layers,
            solutions::list_solution_web_resource_candidates,
            solutions::add_existing_web_resource_to_solution,
            solutions::create_web_resource_in_solution,
            solutions::import_web_resources_in_solution,
            plugins::inspect_plugin_assembly,
            plugins::list_plugin_assemblies,
            plugins::list_plugin_packages,
            plugins::list_plugin_types,
            plugins::list_plugin_steps,
            plugins::list_plugin_step_images,
            plugins::list_plugin_messages,
            plugins::list_plugin_message_filters,
            plugins::list_plugin_service_endpoints,
            plugins::list_plugin_system_users,
            plugins::get_plugin_registration_snapshot,
            plugins::register_plugin_assembly,
            plugins::update_plugin_assembly,
            plugins::unregister_plugin_assembly,
            plugins::create_plugin_type,
            plugins::unregister_plugin_type,
            plugins::register_plugin_step,
            plugins::set_plugin_step_state,
            plugins::set_plugin_component_state,
            plugins::unregister_plugin_step,
            plugins::register_plugin_step_image,
            plugins::unregister_plugin_step_image,
            plugins::register_plugin_service_endpoint,
            plugins::unregister_plugin_service_endpoint,
            plugins::get_plugin_component_dependencies,
            plugins::export_plugin_registration,
            ai::list_ai_chat_threads,
            ai::load_ai_chat_thread,
            ai::start_ai_chat_thread,
            ai::prepare_ai_chat_attachments,
            ai::save_pasted_ai_chat_image,
            ai::send_ai_chat_message,
            ai::dataverse_ai_whoami,
            ai::dataverse_ai_list_entity_sets,
            ai::dataverse_ai_metadata,
            ai::dataverse_ai_get,
            fetchxml::list_fetchxml_entities,
            fetchxml::get_fetchxml_entity_metadata,
            fetchxml::execute_fetchxml_query
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
