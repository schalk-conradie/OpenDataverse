use base64::{
  engine::general_purpose::{STANDARD as BASE64, URL_SAFE_NO_PAD},
  Engine as _,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
  collections::{HashMap, HashSet},
  env, fs,
  io::{BufRead, BufReader, Read, Write},
  net::TcpListener,
  path::PathBuf,
  process::{Child, ChildStdin, ChildStdout, Command, Stdio},
  sync::{Arc, Mutex},
  time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};
use url::{form_urlencoded, Url};
use uuid::Uuid;

const CONFIG_FILE_NAME: &str = "config.json";
const USER_SETTINGS_FILE_NAME: &str = "user-settings.json";
const APP_HOME_DIR_NAME: &str = ".openDataverse";
const LEGACY_APP_HOME_DIR_NAME: &str = ".OpenDataverse";
const TOKENS_DIR_NAME: &str = "tokens";
const CLIENT_ID: &str = "51f81489-12ee-4a9e-aaae-a2591f45987d";
const AUTHORITY_BASE: &str = "https://login.microsoftonline.com/common";
const REDIRECT_URI: &str = "http://localhost:8400";
const AI_DEFAULT_TOP: u32 = 25;
const AI_MAX_TOP: u32 = 100;
const AI_MAX_RESPONSE_BYTES: usize = 1_000_000;
const AI_CHAT_EVENT: &str = "ai-chat-event";
const AI_DEFAULT_MODEL: &str = "gpt-5.4-mini";
const AI_DEFAULT_REASONING_EFFORT: &str = "medium";

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

#[derive(Debug, Deserialize)]
struct WebResourceApiResponse {
  value: Vec<WebResourceApiItem>,
}

#[derive(Debug, Deserialize)]
struct WebResourceApiItem {
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
struct WebResourceContentApiItem {
  #[serde(rename = "webresourceid")]
  id: String,
  name: String,
  #[serde(rename = "webresourcetype")]
  web_resource_type: Option<i32>,
  content: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebResource {
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
struct WebResourceContent {
  id: String,
  name: String,
  #[serde(rename = "type")]
  resource_type: String,
  language: String,
  content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PublishResult {
  web_resource_id: String,
  web_resource_name: String,
  message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FetchXmlEntitySummary {
  logical_name: String,
  entity_set_name: String,
  display_name: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  primary_name_attribute: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  primary_id_attribute: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FetchXmlOptionValue {
  value: i32,
  label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FetchXmlAttributeSummary {
  logical_name: String,
  display_name: String,
  attribute_type: String,
  is_valid_for_read: bool,
  #[serde(skip_serializing_if = "Vec::is_empty")]
  option_values: Vec<FetchXmlOptionValue>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FetchXmlRelationshipSummary {
  id: String,
  schema_name: String,
  relationship_type: String,
  from_entity: String,
  to_entity: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  from_attribute: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  to_attribute: Option<String>,
  display_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FetchXmlEntityMetadata {
  logical_name: String,
  entity_set_name: String,
  display_name: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  primary_name_attribute: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  primary_id_attribute: Option<String>,
  attributes: Vec<FetchXmlAttributeSummary>,
  relationships: Vec<FetchXmlRelationshipSummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FetchXmlQueryResult {
  rows: Vec<Value>,
  columns: Vec<String>,
  entity_set_name: String,
  web_api_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiChatMessage {
  id: String,
  role: String,
  content: String,
  created_at: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  status: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  tool_name: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  metadata: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiChatThread {
  id: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  environment_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  codex_thread_id: Option<String>,
  model: String,
  reasoning_effort: String,
  title: String,
  created_at: String,
  updated_at: String,
  messages: Vec<AiChatMessage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiChatStreamEvent {
  thread_id: String,
  message: AiChatMessage,
}

#[derive(Default)]
struct AiChatState {
  threads: Mutex<HashMap<String, AiChatThread>>,
  sidecar: Mutex<Option<AiSidecarProcess>>,
}

#[derive(Debug)]
struct AiGetRequest {
  path: String,
  query: Vec<(String, String)>,
}

struct AiSidecarProcess {
  child: Child,
  stdin: ChildStdin,
  stdout: BufReader<ChildStdout>,
}

impl Drop for AiSidecarProcess {
  fn drop(&mut self) {
    let _ = self.child.kill();
  }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiSidecarResponse {
  id: String,
  ok: Option<bool>,
  result: Option<Value>,
  error: Option<String>,
  event: Option<Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiCodexToolRequest {
  name: String,
  #[serde(default)]
  arguments: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiCodexTurnResult {
  #[serde(default)]
  codex_thread_id: Option<String>,
  #[serde(default)]
  response: String,
  #[serde(default)]
  tool_requests: Vec<AiCodexToolRequest>,
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
  Ok(
    app
      .path()
      .home_dir()
      .map_err(|error| error.to_string())?
      .join(LEGACY_APP_HOME_DIR_NAME),
  )
}

fn legacy_app_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
  app
    .path()
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
  Ok(
    legacy_opendataverse_dir(app)?
      .join(TOKENS_DIR_NAME)
      .join(format!("token-{}.json", environment_id)),
  )
}

fn legacy_token_path(app: &AppHandle, environment_id: &str) -> Result<PathBuf, String> {
  Ok(
    legacy_app_config_dir(app)?
      .join(TOKENS_DIR_NAME)
      .join(format!("token-{}.json", environment_id)),
  )
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
    item
      .as_bool()
      .or_else(|| item.get("Value").and_then(Value::as_bool))
  })
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

fn is_advanced_find_entity(value: &Value) -> bool {
  let logical_name = json_string(value, "LogicalName").unwrap_or_default();

  json_bool(value, "IsValidForAdvancedFind").unwrap_or(false)
    && !json_bool(value, "IsPrivate").unwrap_or(false)
    && !json_bool(value, "IsIntersect").unwrap_or(false)
    && !is_microsoft_internal_table_name(&logical_name)
}

fn fetchxml_entity_summary_from_value(value: &Value) -> FetchXmlEntitySummary {
  let logical_name = json_string(value, "LogicalName").unwrap_or_default();
  let entity_set_name = json_string(value, "EntitySetName").unwrap_or_else(|| logical_name.clone());
  let display_name = localized_label(value, "DisplayName", &logical_name);

  FetchXmlEntitySummary {
    logical_name,
    entity_set_name,
    display_name,
    primary_name_attribute: json_string(value, "PrimaryNameAttribute"),
    primary_id_attribute: json_string(value, "PrimaryIdAttribute"),
  }
}

fn is_advanced_find_attribute(value: &Value) -> bool {
  value
    .get("IsValidForRead")
    .and_then(Value::as_bool)
    .unwrap_or(true)
    && json_bool(value, "IsValidForAdvancedFind").unwrap_or(true)
}

fn is_microsoft_internal_table_name(value: &str) -> bool {
  let lower = value.to_lowercase();

  lower.contains("msyn_") || lower.contains("msdyn")
}

fn is_valid_designer_relationship(
  relationship: &FetchXmlRelationshipSummary,
  advanced_find_entities: &HashSet<String>,
) -> bool {
  advanced_find_entities.contains(&relationship.from_entity)
    && advanced_find_entities.contains(&relationship.to_entity)
    && !is_microsoft_internal_table_name(&relationship.from_entity)
    && !is_microsoft_internal_table_name(&relationship.to_entity)
    && relationship.from_attribute.is_some()
    && relationship.to_attribute.is_some()
}

fn fetchxml_attribute_from_value(value: &Value) -> Option<FetchXmlAttributeSummary> {
  let logical_name = json_string(value, "LogicalName")?;
  let attribute_type = json_string(value, "AttributeType").unwrap_or_else(|| "Unknown".to_string());
  let display_name = localized_label(value, "DisplayName", &logical_name);
  let is_valid_for_read = value
    .get("IsValidForRead")
    .and_then(Value::as_bool)
    .unwrap_or(true);

  Some(FetchXmlAttributeSummary {
    logical_name,
    display_name,
    attribute_type,
    is_valid_for_read,
    option_values: Vec::new(),
  })
}

async fn advanced_find_entity_logical_names(
  app: &AppHandle,
  environment: &DataverseEnvironment,
) -> Result<HashSet<String>, String> {
  let values = dataverse_get_collection_values(
    app,
    environment,
    "/EntityDefinitions",
    vec![(
      "$select".to_string(),
      "LogicalName,IsValidForAdvancedFind,IsPrivate,IsIntersect".to_string(),
    )],
  )
  .await?;

  Ok(
    values
      .iter()
      .filter(|value| is_advanced_find_entity(value))
      .filter_map(|value| json_string(value, "LogicalName"))
      .collect(),
  )
}

fn sort_fetchxml_attributes(attributes: &mut [FetchXmlAttributeSummary]) {
  attributes.sort_by(|left, right| {
    left
      .display_name
      .to_lowercase()
      .cmp(&right.display_name.to_lowercase())
      .then_with(|| left.logical_name.cmp(&right.logical_name))
  });
}

fn sort_fetchxml_relationships(relationships: &mut [FetchXmlRelationshipSummary]) {
  relationships.sort_by(|left, right| {
    left
      .display_name
      .to_lowercase()
      .cmp(&right.display_name.to_lowercase())
      .then_with(|| left.schema_name.cmp(&right.schema_name))
  });
}

fn many_to_one_relationship_from_value(value: &Value) -> Option<FetchXmlRelationshipSummary> {
  let schema_name = json_string(value, "SchemaName")?;
  let from_entity = json_string(value, "ReferencedEntity")?;
  let to_entity = json_string(value, "ReferencingEntity")?;
  let from_attribute = json_string(value, "ReferencedAttribute");
  let to_attribute = json_string(value, "ReferencingAttribute");

  Some(FetchXmlRelationshipSummary {
    id: format!("many-to-one:{schema_name}"),
    display_name: format!("{schema_name} ({from_entity})"),
    schema_name,
    relationship_type: "many-to-one".to_string(),
    from_entity,
    to_entity,
    from_attribute,
    to_attribute,
  })
}

fn one_to_many_relationship_from_value(value: &Value) -> Option<FetchXmlRelationshipSummary> {
  let schema_name = json_string(value, "SchemaName")?;
  let from_entity = json_string(value, "ReferencingEntity")?;
  let to_entity = json_string(value, "ReferencedEntity")?;
  let from_attribute = json_string(value, "ReferencingAttribute");
  let to_attribute = json_string(value, "ReferencedAttribute");

  Some(FetchXmlRelationshipSummary {
    id: format!("one-to-many:{schema_name}"),
    display_name: format!("{schema_name} ({from_entity})"),
    schema_name,
    relationship_type: "one-to-many".to_string(),
    from_entity,
    to_entity,
    from_attribute,
    to_attribute,
  })
}

fn many_to_many_relationship_from_value(
  current_entity: &str,
  value: &Value,
) -> Option<FetchXmlRelationshipSummary> {
  let schema_name = json_string(value, "SchemaName")?;
  let entity_one = json_string(value, "Entity1LogicalName")?;
  let entity_two = json_string(value, "Entity2LogicalName")?;
  let from_entity = if entity_one == current_entity {
    entity_two
  } else {
    entity_one
  };

  Some(FetchXmlRelationshipSummary {
    id: format!("many-to-many:{schema_name}"),
    display_name: format!("{schema_name} ({from_entity})"),
    schema_name,
    relationship_type: "many-to-many".to_string(),
    from_entity,
    to_entity: current_entity.to_string(),
    from_attribute: None,
    to_attribute: None,
  })
}

fn extract_fetchxml_entity_name(fetch_xml: &str) -> Result<String, String> {
  let lower = fetch_xml.to_lowercase();
  let entity_start = lower
    .find("<entity")
    .ok_or_else(|| "FetchXML must include one entity element.".to_string())?;
  let entity_slice = fetch_xml
    .get(entity_start..)
    .ok_or_else(|| "FetchXML entity element could not be read.".to_string())?;
  let tag_end = entity_slice
    .find('>')
    .ok_or_else(|| "FetchXML entity element is not closed.".to_string())?;
  let tag = &entity_slice[..tag_end];

  for quote in ['"', '\''] {
    let marker = format!("name={quote}");
    if let Some(name_start) = tag.to_lowercase().find(&marker) {
      let value_start = name_start + marker.len();
      let rest = &tag[value_start..];
      let value_end = rest
        .find(quote)
        .ok_or_else(|| "FetchXML entity name attribute is not closed.".to_string())?;
      return validate_logical_name(&rest[..value_end]);
    }
  }

  Err("FetchXML entity element must include a name attribute.".to_string())
}

fn collect_result_columns(rows: &[Value]) -> Vec<String> {
  let mut columns = Vec::new();

  for row in rows {
    let Some(object) = row.as_object() else {
      continue;
    };

    for key in object.keys() {
      if key.starts_with('@') || key.contains("@odata.") {
        continue;
      }

      if !columns.iter().any(|column| column == key) {
        columns.push(key.clone());
      }
    }
  }

  columns
}

fn fetchxml_web_api_url(
  environment: &DataverseEnvironment,
  entity_set_name: &str,
  fetch_xml: &str,
) -> String {
  let mut query = form_urlencoded::Serializer::new(String::new());
  query.append_pair("fetchXml", fetch_xml);

  format!(
    "{}/api/data/v9.2/{}?{}",
    normalize_org_url(&environment.url),
    entity_set_name,
    query.finish()
  )
}

fn map_resource_type(value: Option<i32>) -> String {
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

fn map_resource_language(resource_type: Option<i32>, name: &str) -> String {
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

fn normalize_ai_model(model: Option<&str>) -> Result<String, String> {
  let model = model
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or(AI_DEFAULT_MODEL);

  match model {
    "gpt-5.5" | "gpt-5.4" | "gpt-5.4-mini" | "gpt-5.3-codex-spark" => Ok(model.to_string()),
    _ => Err(format!("Unsupported Codex model: {model}")),
  }
}

fn normalize_ai_reasoning_effort(reasoning_effort: Option<&str>) -> Result<String, String> {
  let reasoning_effort = reasoning_effort
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or(AI_DEFAULT_REASONING_EFFORT);

  match reasoning_effort {
    "low" | "medium" | "high" | "xhigh" => Ok(reasoning_effort.to_string()),
    _ => Err(format!(
      "Unsupported Codex reasoning effort: {reasoning_effort}"
    )),
  }
}

fn create_ai_chat_thread(
  environment_id: Option<String>,
  model: Option<&str>,
  reasoning_effort: Option<&str>,
) -> Result<AiChatThread, String> {
  let now = now_rfc3339()?;

  Ok(AiChatThread {
    id: format!("ai-thread-{}", Uuid::new_v4()),
    environment_id,
    codex_thread_id: None,
    model: normalize_ai_model(model)?,
    reasoning_effort: normalize_ai_reasoning_effort(reasoning_effort)?,
    title: "Dataverse Chat".to_string(),
    created_at: now.clone(),
    updated_at: now,
    messages: Vec::new(),
  })
}

fn create_ai_message(
  role: &str,
  content: impl Into<String>,
  status: &str,
) -> Result<AiChatMessage, String> {
  Ok(AiChatMessage {
    id: format!("ai-message-{}", Uuid::new_v4()),
    role: role.to_string(),
    content: content.into(),
    created_at: now_rfc3339()?,
    status: Some(status.to_string()),
    tool_name: None,
    metadata: None,
  })
}

fn create_ai_tool_message(
  tool_name: &str,
  content: impl Into<String>,
  status: &str,
  metadata: Option<Value>,
) -> Result<AiChatMessage, String> {
  Ok(AiChatMessage {
    id: format!("ai-message-{}", Uuid::new_v4()),
    role: "tool".to_string(),
    content: content.into(),
    created_at: now_rfc3339()?,
    status: Some(status.to_string()),
    tool_name: Some(tool_name.to_string()),
    metadata,
  })
}

fn emit_ai_chat_message(app: &AppHandle, thread_id: &str, message: &AiChatMessage) {
  let _ = app.emit(
    AI_CHAT_EVENT,
    AiChatStreamEvent {
      thread_id: thread_id.to_string(),
      message: message.clone(),
    },
  );
}

fn mark_ai_message_status(message: &AiChatMessage, status: &str) -> AiChatMessage {
  let mut next = message.clone();
  next.status = Some(status.to_string());
  next
}

fn ai_sidecar_script_path(app: &AppHandle) -> Result<PathBuf, String> {
  let mut candidates = Vec::new();

  if let Ok(current_dir) = env::current_dir() {
    candidates.push(current_dir.join("src-sidecar/ai/dist/index.js"));
  }

  candidates
    .push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src-sidecar/ai/dist/index.js"));

  if let Ok(resource_dir) = app.path().resource_dir() {
    candidates.push(resource_dir.join("src-sidecar/ai/dist/index.js"));
    candidates.push(resource_dir.join("ai-sidecar/index.js"));
  }

  for candidate in candidates {
    if candidate.exists() {
      return Ok(candidate);
    }
  }

  Err(
    "AI sidecar is not built. Run `npm --prefix src-sidecar/ai install && npm --prefix src-sidecar/ai run build`, then restart OpenDataverse."
      .to_string(),
  )
}

fn ai_node_command() -> String {
  env::var("OPENDATAVERSE_AI_NODE").unwrap_or_else(|_| "node".to_string())
}

fn spawn_ai_sidecar(app: &AppHandle) -> Result<AiSidecarProcess, String> {
  let script_path = ai_sidecar_script_path(app)?;
  let home_dir = app.path().home_dir().map_err(|error| error.to_string())?;
  let codex_home = env::var_os("CODEX_HOME")
    .map(PathBuf::from)
    .unwrap_or_else(|| home_dir.join(".codex"));
  let mut command = Command::new(ai_node_command());
  command
    .arg(&script_path)
    .env("HOME", &home_dir)
    .env("CODEX_HOME", &codex_home)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::null());

  let mut child = command.spawn().map_err(|error| {
    format!(
      "Could not start AI sidecar with Node. Install Node or set OPENDATAVERSE_AI_NODE. {error}"
    )
  })?;
  let stdin = child
    .stdin
    .take()
    .ok_or_else(|| "AI sidecar stdin was not available.".to_string())?;
  let stdout = child
    .stdout
    .take()
    .ok_or_else(|| "AI sidecar stdout was not available.".to_string())?;

  Ok(AiSidecarProcess {
    child,
    stdin,
    stdout: BufReader::new(stdout),
  })
}

fn ensure_ai_sidecar<'a>(
  app: &AppHandle,
  sidecar: &'a mut Option<AiSidecarProcess>,
) -> Result<&'a mut AiSidecarProcess, String> {
  let should_restart = match sidecar.as_mut() {
    Some(process) => process
      .child
      .try_wait()
      .map_err(|error| format!("Could not inspect AI sidecar: {error}"))?
      .is_some(),
    None => true,
  };

  if should_restart {
    *sidecar = Some(spawn_ai_sidecar(app)?);
  }

  sidecar
    .as_mut()
    .ok_or_else(|| "AI sidecar was not available.".to_string())
}

fn run_ai_sidecar_stream_request(
  app: &AppHandle,
  state: &State<'_, AiChatState>,
  method: &str,
  params: Value,
  mut on_event: impl FnMut(Value),
) -> Result<Value, String> {
  let request_id = Uuid::new_v4().to_string();
  let request = serde_json::json!({
    "id": request_id,
    "method": method,
    "params": params,
  });
  let mut sidecar_slot = state.sidecar.lock().map_err(|error| error.to_string())?;
  let process = ensure_ai_sidecar(app, &mut sidecar_slot)?;

  process
    .stdin
    .write_all(format!("{request}\n").as_bytes())
    .and_then(|_| process.stdin.flush())
    .map_err(|error| format!("Could not send request to AI sidecar: {error}"))?;

  let mut line = String::new();
  loop {
    line.clear();
    let bytes_read = process
      .stdout
      .read_line(&mut line)
      .map_err(|error| format!("Could not read AI sidecar response: {error}"))?;

    if bytes_read == 0 {
      *sidecar_slot = None;
      return Err("AI sidecar stopped before returning a response.".to_string());
    }

    let response: AiSidecarResponse = serde_json::from_str(line.trim()).map_err(|error| {
      format!(
        "AI sidecar returned invalid JSON: {error}. Response: {}",
        line.trim()
      )
    })?;

    if response.id != request_id {
      continue;
    }

    if let Some(event) = response.event {
      on_event(event);
      continue;
    }

    if response.ok.unwrap_or(false) {
      return Ok(response.result.unwrap_or(Value::Null));
    }

    return Err(
      response
        .error
        .unwrap_or_else(|| "AI sidecar request failed.".to_string()),
    );
  }
}

fn environment_by_id(
  app: &AppHandle,
  environment_id: Option<&str>,
) -> Result<DataverseEnvironment, String> {
  let environment_id =
    environment_id.ok_or_else(|| "Select a Dataverse environment first.".to_string())?;
  let config = load_config(app.clone())?;

  config
    .environments
    .into_iter()
    .find(|environment| environment.id == environment_id)
    .ok_or_else(|| "Selected Dataverse environment was not found.".to_string())
}

fn redact_sensitive_error(error: &str) -> String {
  let mut redacted = Vec::new();
  let mut previous_was_bearer = false;

  for part in error.split_whitespace() {
    if previous_was_bearer {
      redacted.push("[redacted]");
      previous_was_bearer = false;
      continue;
    }

    previous_was_bearer = part.eq_ignore_ascii_case("bearer");
    redacted.push(part);
  }

  redacted.join(" ")
}

fn user_safe_ai_error(error: String) -> String {
  let redacted = redact_sensitive_error(&error);
  let lower = redacted.to_lowercase();

  if lower.contains("token was not found")
    || lower.contains("no such file")
    || lower.contains("no refresh token")
    || lower.contains("sign in again")
  {
    return "Connect this environment before using AI Chat.".to_string();
  }

  if lower.contains("token refresh failed") || lower.contains("invalid_grant") {
    return "Reconnect this environment.".to_string();
  }

  redacted
}

fn user_safe_codex_error(error: String) -> String {
  let redacted = redact_sensitive_error(&error);
  let lower = redacted.to_lowercase();

  if lower.contains("token was not found")
    || lower.contains("not logged in")
    || lower.contains("auth.json")
    || lower.contains("codex login")
    || lower.contains("codex_access_token")
    || lower.contains("codex_api_key")
  {
    return "Codex could not read your local Codex credentials. OpenDataverse passes CODEX_HOME to the AI sidecar; if this continues, run `codex login` once and restart OpenDataverse.".to_string();
  }

  redacted
}

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
      map
        .into_iter()
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

fn normalize_ai_get_request(input: &str) -> Result<AiGetRequest, String> {
  let trimmed = input.trim();
  if trimmed.is_empty() {
    return Err("A Dataverse API path is required.".to_string());
  }

  if trimmed.starts_with("//") || Url::parse(trimmed).is_ok() {
    return Err("Absolute URLs are not allowed for AI Chat Dataverse GET.".to_string());
  }

  if trimmed.contains('#') || trimmed.contains('\\') {
    return Err("Fragments and backslashes are not allowed in Dataverse GET paths.".to_string());
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

fn ai_tool_argument(arguments: &Value, name: &str) -> Option<String> {
  arguments
    .get(name)
    .and_then(Value::as_str)
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(ToString::to_string)
}

fn run_codex_turn(
  app: &AppHandle,
  state: &State<'_, AiChatState>,
  thread: &AiChatThread,
  environment: &DataverseEnvironment,
  message: &str,
  tool_results: Vec<Value>,
) -> Result<AiCodexTurnResult, String> {
  let result = run_ai_sidecar_stream_request(
    app,
    state,
    "run_turn_stream",
    serde_json::json!({
      "threadId": thread.id,
      "codexThreadId": thread.codex_thread_id,
      "environmentId": environment.id,
      "message": message,
      "model": thread.model,
      "reasoningEffort": thread.reasoning_effort,
      "toolResults": tool_results,
    }),
    |_event| {},
  )
  .map_err(user_safe_codex_error)?;

  serde_json::from_value(result).map_err(|error| format!("Parse Codex sidecar response: {error}"))
}

async fn execute_codex_tool_request(
  app: &AppHandle,
  thread_id: &str,
  environment: &DataverseEnvironment,
  request: &AiCodexToolRequest,
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
    _ => (
      request.name.clone(),
      Err("Unknown Dataverse AI tool requested by Codex.".to_string()),
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

async fn build_codex_ai_chat_response(
  app: &AppHandle,
  state: &State<'_, AiChatState>,
  thread: &mut AiChatThread,
  environment: &DataverseEnvironment,
  message: &str,
) -> Result<Vec<AiChatMessage>, String> {
  let mut messages = Vec::new();
  let codex_turn_message = create_ai_tool_message(
    "codex",
    "run_turn",
    "streaming",
    Some(serde_json::json!({
      "model": thread.model,
      "reasoningEffort": thread.reasoning_effort,
    })),
  )?;
  emit_ai_chat_message(app, &thread.id, &codex_turn_message);
  let first_turn = run_codex_turn(app, state, thread, environment, message, Vec::new())?;
  thread.codex_thread_id = first_turn
    .codex_thread_id
    .clone()
    .or(thread.codex_thread_id.clone());
  let mut codex_turn_message = mark_ai_message_status(&codex_turn_message, "complete");
  codex_turn_message.metadata = Some(serde_json::json!({
    "codexThreadId": thread.codex_thread_id,
    "toolRequestCount": first_turn.tool_requests.len(),
    "model": thread.model,
    "reasoningEffort": thread.reasoning_effort,
  }));
  emit_ai_chat_message(app, &thread.id, &codex_turn_message);
  messages.push(codex_turn_message);

  if first_turn.tool_requests.is_empty() {
    let response = first_turn.response.trim();
    let assistant_message = create_ai_message(
      "assistant",
      if response.is_empty() {
        "Codex completed the turn without a response."
      } else {
        response
      },
      "complete",
    )?;
    emit_ai_chat_message(app, &thread.id, &assistant_message);
    messages.push(assistant_message);
    return Ok(messages);
  }

  let mut tool_results = Vec::new();
  for request in first_turn.tool_requests.iter().take(4) {
    let (tool_message, tool_result) =
      execute_codex_tool_request(app, &thread.id, environment, request).await?;
    messages.push(tool_message);
    tool_results.push(tool_result);
  }

  if first_turn.tool_requests.len() > 4 {
    tool_results.push(serde_json::json!({
      "name": "tool_limit",
      "arguments": {},
      "ok": false,
      "error": "OpenDataverse executed only the first 4 tool requests for this turn.",
    }));
  }

  let codex_summary_message = create_ai_tool_message(
    "codex",
    "run_turn_with_tool_results",
    "streaming",
    Some(serde_json::json!({
      "model": thread.model,
      "reasoningEffort": thread.reasoning_effort,
      "toolResultCount": tool_results.len(),
    })),
  )?;
  emit_ai_chat_message(app, &thread.id, &codex_summary_message);
  let final_turn = run_codex_turn(
    app,
    state,
    thread,
    environment,
    message,
    tool_results.clone(),
  )?;
  thread.codex_thread_id = final_turn
    .codex_thread_id
    .clone()
    .or(thread.codex_thread_id.clone());
  let mut codex_summary_message = mark_ai_message_status(&codex_summary_message, "complete");
  codex_summary_message.metadata = Some(serde_json::json!({
    "codexThreadId": thread.codex_thread_id,
    "toolResultCount": tool_results.len(),
    "model": thread.model,
    "reasoningEffort": thread.reasoning_effort,
  }));
  emit_ai_chat_message(app, &thread.id, &codex_summary_message);
  messages.push(codex_summary_message);

  let response = final_turn.response.trim();
  let assistant_message = create_ai_message(
    "assistant",
    if response.is_empty() {
      "Codex received the Dataverse tool results but did not return a summary."
    } else {
      response
    },
    "complete",
  )?;
  emit_ai_chat_message(app, &thread.id, &assistant_message);
  messages.push(assistant_message);

  Ok(messages)
}

#[tauri::command]
fn load_config(app: AppHandle) -> Result<AppConfig, String> {
  let path = config_path(&app)?;

  if !path.exists() {
    let legacy_home_path = legacy_home_config_path(&app)?;
    if legacy_home_path.exists() {
      let legacy_data = fs::read_to_string(&legacy_home_path).map_err(|error| error.to_string())?;
      if !legacy_data.trim().is_empty() {
        fs::write(&path, &legacy_data).map_err(|error| error.to_string())?;
        return serde_json::from_str(&legacy_data).map_err(|error| error.to_string());
      }
    }

    let legacy_path = legacy_config_path(&app)?;
    if legacy_path.exists() {
      let legacy_data = fs::read_to_string(&legacy_path).map_err(|error| error.to_string())?;
      if !legacy_data.trim().is_empty() {
        fs::write(&path, &legacy_data).map_err(|error| error.to_string())?;
        return serde_json::from_str(&legacy_data).map_err(|error| error.to_string());
      }
    }

    return Ok(AppConfig::default());
  }

  let data = fs::read_to_string(path).map_err(|error| error.to_string())?;

  if data.trim().is_empty() {
    return Ok(AppConfig::default());
  }

  serde_json::from_str(&data).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
  let path = config_path(&app)?;
  let data = serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?;
  fs::write(path, data).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_user_settings(app: AppHandle) -> Result<UserSettings, String> {
  let path = user_settings_path(&app)?;

  if !path.exists() {
    return Ok(UserSettings::default());
  }

  let data = fs::read_to_string(path).map_err(|error| error.to_string())?;

  if data.trim().is_empty() {
    return Ok(UserSettings::default());
  }

  serde_json::from_str(&data).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_user_settings(app: AppHandle, settings: UserSettings) -> Result<(), String> {
  let path = user_settings_path(&app)?;
  let data = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
  fs::write(path, data).map_err(|error| error.to_string())
}

#[tauri::command]
async fn start_browser_auth(
  state: State<'_, PendingAuthState>,
  environment: DataverseEnvironment,
) -> Result<BrowserAuthStart, String> {
  let session_id = Uuid::new_v4().to_string();
  let state_id = Uuid::new_v4().to_string();
  let code_verifier = create_code_verifier();
  let code_challenge = create_code_challenge(&code_verifier);
  let expires_at = now_unix()? + 900;
  let result: Arc<Mutex<Option<Result<AuthCodeResult, String>>>> = Arc::new(Mutex::new(None));
  let thread_result = Arc::clone(&result);
  let expected_state = state_id.clone();

  let listener = TcpListener::bind("localhost:8400")
    .map_err(|error| format!("Could not listen on {REDIRECT_URI}: {error}"))?;

  std::thread::spawn(move || {
    let auth_result = listener
      .incoming()
      .next()
      .ok_or_else(|| "Browser redirect listener stopped".to_string())
      .and_then(|stream| stream.map_err(|error| error.to_string()))
      .and_then(read_auth_code_request)
      .and_then(|result| {
        if result.state != expected_state {
          return Err("Browser redirect state did not match the auth session".to_string());
        }
        Ok(result)
      });

    if let Ok(mut slot) = thread_result.lock() {
      *slot = Some(auth_result);
    }
  });

  let mut auth_url = Url::parse(&format!("{AUTHORITY_BASE}/oauth2/v2.0/authorize"))
    .map_err(|error| error.to_string())?;
  auth_url
    .query_pairs_mut()
    .append_pair("client_id", CLIENT_ID)
    .append_pair("response_type", "code")
    .append_pair("redirect_uri", REDIRECT_URI)
    .append_pair("response_mode", "query")
    .append_pair("scope", &auth_scope(&environment.url))
    .append_pair("state", &state_id)
    .append_pair("code_challenge", &code_challenge)
    .append_pair("code_challenge_method", "S256");

  state
    .sessions
    .lock()
    .map_err(|error| error.to_string())?
    .insert(
      session_id.clone(),
      PendingBrowserAuth {
        environment_id: environment.id.clone(),
        code_verifier,
        result,
        expires_at,
      },
    );

  Ok(BrowserAuthStart {
    session_id,
    auth_url: auth_url.to_string(),
    redirect_uri: REDIRECT_URI.to_string(),
    expires_at,
  })
}

#[tauri::command]
async fn complete_browser_auth(
  app: AppHandle,
  state: State<'_, PendingAuthState>,
  environment: DataverseEnvironment,
  session_id: String,
) -> Result<AuthSession, String> {
  let pending = state
    .sessions
    .lock()
    .map_err(|error| error.to_string())?
    .get(&session_id)
    .cloned()
    .ok_or_else(|| "Auth session was not found. Start sign-in again.".to_string())?;

  if pending.environment_id != environment.id {
    return Err("Auth session does not match the selected environment".to_string());
  }

  let auth_code = loop {
    if now_unix()? >= pending.expires_at {
      state
        .sessions
        .lock()
        .map_err(|error| error.to_string())?
        .remove(&session_id);
      return Err("The browser sign-in expired. Start sign-in again.".to_string());
    }

    let maybe_result = pending
      .result
      .lock()
      .map_err(|error| error.to_string())?
      .clone();

    if let Some(result) = maybe_result {
      break result?;
    }

    tokio::time::sleep(Duration::from_millis(250)).await;
  };

  let client = Client::new();
  let response = client
    .post(format!("{AUTHORITY_BASE}/oauth2/v2.0/token"))
    .form(&[
      ("client_id", CLIENT_ID.to_string()),
      ("grant_type", "authorization_code".to_string()),
      ("code", auth_code.code),
      ("redirect_uri", REDIRECT_URI.to_string()),
      ("code_verifier", pending.code_verifier),
      ("scope", auth_scope(&environment.url)),
    ])
    .send()
    .await
    .map_err(|error| error.to_string())?;

  let status = response.status();
  let body = response.text().await.map_err(|error| error.to_string())?;
  if !status.is_success() {
    state
      .sessions
      .lock()
      .map_err(|error| error.to_string())?
      .remove(&session_id);
    return Err(format!(
      "Auth code token exchange failed ({status}): {body}"
    ));
  }

  let token = token_from_response(
    serde_json::from_str(&body).map_err(|error| format!("Parse token response: {error}"))?,
  )?;
  save_token(&app, &environment.id, &token)?;

  let whoami_body = dataverse_get(&app, &environment, "/WhoAmI", &[]).await?;
  let whoami: WhoAmIResponse =
    serde_json::from_str(&whoami_body).map_err(|error| error.to_string())?;

  state
    .sessions
    .lock()
    .map_err(|error| error.to_string())?
    .remove(&session_id);

  Ok(AuthSession {
    environment_id: environment.id,
    status: "connected".to_string(),
    message: format!("Connected to Dataverse as user {}", whoami.user_id),
  })
}

#[tauri::command]
async fn check_dataverse_connection(
  app: AppHandle,
  environment: DataverseEnvironment,
) -> Result<AuthSession, String> {
  let body = dataverse_get(&app, &environment, "/WhoAmI", &[]).await?;
  let whoami: WhoAmIResponse = serde_json::from_str(&body).map_err(|error| error.to_string())?;

  Ok(AuthSession {
    environment_id: environment.id,
    status: "connected".to_string(),
    message: format!("Connected to Dataverse as user {}", whoami.user_id),
  })
}

#[tauri::command]
async fn list_web_resources(
  app: AppHandle,
  environment: DataverseEnvironment,
  include_managed: bool,
) -> Result<Vec<WebResource>, String> {
  let mut filter =
    "(webresourcetype eq 1 or webresourcetype eq 2 or webresourcetype eq 3 or webresourcetype eq 4 or webresourcetype eq 11 or webresourcetype eq 12)"
      .to_string();
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

  Ok(
    response
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
      .collect(),
  )
}

#[tauri::command]
async fn get_web_resource_content(
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
  let encoded = resource.content.unwrap_or_default();
  let bytes = if encoded.trim().is_empty() {
    Vec::new()
  } else {
    BASE64
      .decode(encoded)
      .map_err(|error| format!("Decode web resource content: {error}"))?
  };
  let content = String::from_utf8(bytes)
    .map_err(|error| format!("Web resource content is not UTF-8 text: {error}"))?;

  Ok(WebResourceContent {
    id: resource.id,
    name: resource.name.clone(),
    resource_type: map_resource_type(resource.web_resource_type),
    language: map_resource_language(resource.web_resource_type, &resource.name),
    content,
  })
}

#[tauri::command]
async fn publish_web_resource(
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
  let content = BASE64.encode(bytes);

  dataverse_json_request(
    &app,
    &environment,
    reqwest::Method::PATCH,
    &format!("/webresourceset({})", binding.web_resource_id),
    &serde_json::json!({ "content": content }),
  )
  .await?;

  let parameter_xml = format!(
    "<importexportxml><webresources><webresource>{}</webresource></webresources></importexportxml>",
    binding.web_resource_id
  );

  dataverse_json_request(
    &app,
    &environment,
    reqwest::Method::POST,
    "/PublishXml",
    &serde_json::json!({ "ParameterXml": parameter_xml }),
  )
  .await?;

  Ok(PublishResult {
    web_resource_id: binding.web_resource_id,
    web_resource_name: binding.web_resource_name.clone(),
    message: format!("Published {}", binding.web_resource_name),
  })
}

#[tauri::command]
fn start_ai_chat_thread(
  state: State<'_, AiChatState>,
  environment_id: Option<String>,
  model: Option<String>,
  reasoning_effort: Option<String>,
) -> Result<AiChatThread, String> {
  let thread = create_ai_chat_thread(
    environment_id,
    model.as_deref(),
    reasoning_effort.as_deref(),
  )?;

  state
    .threads
    .lock()
    .map_err(|error| error.to_string())?
    .insert(thread.id.clone(), thread.clone());

  Ok(thread)
}

#[tauri::command]
async fn send_ai_chat_message(
  app: AppHandle,
  state: State<'_, AiChatState>,
  thread_id: String,
  environment_id: Option<String>,
  message: String,
  model: Option<String>,
  reasoning_effort: Option<String>,
) -> Result<Vec<AiChatMessage>, String> {
  let trimmed = message.trim();
  if trimmed.is_empty() {
    return Err("Message is required.".to_string());
  }

  let environment = environment_by_id(&app, environment_id.as_deref())?;
  let model = normalize_ai_model(model.as_deref())?;
  let reasoning_effort = normalize_ai_reasoning_effort(reasoning_effort.as_deref())?;
  let mut thread = {
    let mut threads = state.threads.lock().map_err(|error| error.to_string())?;
    if let Some(thread) = threads.remove(&thread_id) {
      thread
    } else {
      let mut thread = create_ai_chat_thread(
        Some(environment.id.clone()),
        Some(&model),
        Some(&reasoning_effort),
      )?;
      thread.id = thread_id.clone();
      thread
    }
  };

  thread.environment_id = Some(environment.id.clone());
  thread.model = model;
  thread.reasoning_effort = reasoning_effort;
  thread
    .messages
    .push(create_ai_message("user", trimmed, "complete")?);

  let response_messages =
    match build_codex_ai_chat_response(&app, &state, &mut thread, &environment, trimmed).await {
      Ok(messages) => messages,
      Err(error) => vec![
        create_ai_tool_message("codex", "run_turn", "error", None)?,
        create_ai_message(
          "assistant",
          format!("Codex request failed: {}", user_safe_ai_error(error)),
          "error",
        )?,
      ],
    };
  thread.messages.extend(response_messages);
  thread.updated_at = now_rfc3339()?;

  let messages = thread.messages.clone();
  state
    .threads
    .lock()
    .map_err(|error| error.to_string())?
    .insert(thread.id.clone(), thread);

  Ok(messages)
}

#[tauri::command]
async fn dataverse_ai_whoami(app: AppHandle, environment_id: String) -> Result<Value, String> {
  let environment = environment_by_id(&app, Some(&environment_id))?;
  dataverse_ai_whoami_value(&app, &environment).await
}

#[tauri::command]
async fn dataverse_ai_list_entity_sets(
  app: AppHandle,
  environment_id: String,
  search: Option<String>,
) -> Result<Value, String> {
  let environment = environment_by_id(&app, Some(&environment_id))?;
  dataverse_ai_list_entity_sets_value(&app, &environment, search).await
}

#[tauri::command]
async fn dataverse_ai_metadata(
  app: AppHandle,
  environment_id: String,
  logical_name: Option<String>,
) -> Result<Value, String> {
  let environment = environment_by_id(&app, Some(&environment_id))?;
  dataverse_ai_metadata_value(&app, &environment, logical_name).await
}

#[tauri::command]
async fn dataverse_ai_get(
  app: AppHandle,
  environment_id: String,
  path: String,
) -> Result<Value, String> {
  let environment = environment_by_id(&app, Some(&environment_id))?;
  dataverse_ai_get_value(&app, &environment, &path)
    .await
    .map(|(value, _)| value)
}

#[tauri::command]
async fn list_fetchxml_entities(
  app: AppHandle,
  environment: DataverseEnvironment,
) -> Result<Vec<FetchXmlEntitySummary>, String> {
  let values = dataverse_get_collection_values(
    &app,
    &environment,
    "/EntityDefinitions",
    vec![(
      "$select".to_string(),
      "LogicalName,EntitySetName,DisplayName,PrimaryNameAttribute,PrimaryIdAttribute,IsValidForAdvancedFind,IsPrivate,IsIntersect".to_string(),
    )],
  )
  .await?;
  let mut entities = values
    .iter()
    .filter(|value| is_advanced_find_entity(value))
    .map(fetchxml_entity_summary_from_value)
    .filter(|entity| !entity.logical_name.is_empty() && !entity.entity_set_name.is_empty())
    .collect::<Vec<_>>();

  entities.sort_by(|left, right| {
    left
      .display_name
      .to_lowercase()
      .cmp(&right.display_name.to_lowercase())
      .then_with(|| left.logical_name.cmp(&right.logical_name))
  });

  Ok(entities)
}

#[tauri::command]
async fn get_fetchxml_entity_metadata(
  app: AppHandle,
  environment: DataverseEnvironment,
  logical_name: String,
) -> Result<FetchXmlEntityMetadata, String> {
  let logical_name = validate_logical_name(&logical_name)?;
  let entity_value = dataverse_get_json_value(
    &app,
    &environment,
    &format!("/EntityDefinitions(LogicalName='{logical_name}')"),
    &[(
      "$select",
      "LogicalName,EntitySetName,DisplayName,PrimaryNameAttribute,PrimaryIdAttribute",
    )],
  )
  .await?;
  let entity = fetchxml_entity_summary_from_value(&entity_value);

  let attribute_values = dataverse_get_collection_values(
    &app,
    &environment,
    &format!("/EntityDefinitions(LogicalName='{logical_name}')/Attributes"),
    vec![(
      "$select".to_string(),
      "LogicalName,AttributeType,DisplayName,IsValidForRead,IsValidForAdvancedFind".to_string(),
    )],
  )
  .await?;
  let mut attributes = attribute_values
    .iter()
    .filter(|value| is_advanced_find_attribute(value))
    .filter_map(fetchxml_attribute_from_value)
    .collect::<Vec<_>>();
  sort_fetchxml_attributes(&mut attributes);

  let mut relationships = Vec::new();
  let many_to_one_values = dataverse_get_collection_values(
    &app,
    &environment,
    &format!("/EntityDefinitions(LogicalName='{logical_name}')/ManyToOneRelationships"),
    vec![(
      "$select".to_string(),
      "SchemaName,ReferencedEntity,ReferencedAttribute,ReferencingEntity,ReferencingAttribute"
        .to_string(),
    )],
  )
  .await?;
  relationships.extend(
    many_to_one_values
      .iter()
      .filter_map(many_to_one_relationship_from_value),
  );

  let one_to_many_values = dataverse_get_collection_values(
    &app,
    &environment,
    &format!("/EntityDefinitions(LogicalName='{logical_name}')/OneToManyRelationships"),
    vec![(
      "$select".to_string(),
      "SchemaName,ReferencedEntity,ReferencedAttribute,ReferencingEntity,ReferencingAttribute"
        .to_string(),
    )],
  )
  .await?;
  relationships.extend(
    one_to_many_values
      .iter()
      .filter_map(one_to_many_relationship_from_value),
  );

  let many_to_many_values = dataverse_get_collection_values(
    &app,
    &environment,
    &format!("/EntityDefinitions(LogicalName='{logical_name}')/ManyToManyRelationships"),
    vec![(
      "$select".to_string(),
      "SchemaName,Entity1LogicalName,Entity1IntersectAttribute,Entity2LogicalName,Entity2IntersectAttribute"
        .to_string(),
    )],
  )
  .await?;
  relationships.extend(
    many_to_many_values
      .iter()
      .filter_map(|value| many_to_many_relationship_from_value(&logical_name, value)),
  );
  let advanced_find_entities = advanced_find_entity_logical_names(&app, &environment).await?;
  relationships.retain(|relationship| {
    is_valid_designer_relationship(relationship, &advanced_find_entities)
  });
  sort_fetchxml_relationships(&mut relationships);

  Ok(FetchXmlEntityMetadata {
    logical_name: entity.logical_name,
    entity_set_name: entity.entity_set_name,
    display_name: entity.display_name,
    primary_name_attribute: entity.primary_name_attribute,
    primary_id_attribute: entity.primary_id_attribute,
    attributes,
    relationships,
  })
}

#[tauri::command]
async fn execute_fetchxml_query(
  app: AppHandle,
  environment: DataverseEnvironment,
  fetch_xml: String,
) -> Result<FetchXmlQueryResult, String> {
  let logical_name = extract_fetchxml_entity_name(&fetch_xml)?;
  let entity_value = dataverse_get_json_value(
    &app,
    &environment,
    &format!("/EntityDefinitions(LogicalName='{logical_name}')"),
    &[("$select", "LogicalName,EntitySetName")],
  )
  .await?;
  let entity = fetchxml_entity_summary_from_value(&entity_value);

  if entity.entity_set_name.is_empty() {
    return Err(format!(
      "Could not resolve an entity set name for {logical_name}."
    ));
  }

  let response = dataverse_get_json_value(
    &app,
    &environment,
    &format!("/{}", entity.entity_set_name),
    &[("fetchXml", &fetch_xml)],
  )
  .await?;
  let rows = response
    .get("value")
    .and_then(Value::as_array)
    .cloned()
    .unwrap_or_default();
  let columns = collect_result_columns(&rows);
  let web_api_url = fetchxml_web_api_url(&environment, &entity.entity_set_name, &fetch_xml);

  Ok(FetchXmlQueryResult {
    rows,
    columns,
    entity_set_name: entity.entity_set_name,
    web_api_url,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  fn query_value(request: &AiGetRequest, key: &str) -> Option<String> {
    request
      .query
      .iter()
      .find(|(item_key, _)| item_key == key)
      .map(|(_, value)| value.clone())
  }

  #[test]
  fn ai_get_rejects_absolute_urls() {
    let error = normalize_ai_get_request("https://org.crm.dynamics.com/api/data/v9.2/accounts")
      .expect_err("absolute URLs must be rejected");

    assert!(error.contains("Absolute URLs"));
  }

  #[test]
  fn ai_get_normalizes_api_prefix_and_injects_top() {
    let request = normalize_ai_get_request("/api/data/v9.2/accounts?$select=name")
      .expect("relative v9.2 API paths should normalize");

    assert_eq!(request.path, "/accounts");
    assert_eq!(query_value(&request, "$select").as_deref(), Some("name"));
    assert_eq!(query_value(&request, "$top").as_deref(), Some("25"));
  }

  #[test]
  fn ai_get_caps_top() {
    let request =
      normalize_ai_get_request("accounts?$select=name&$top=500").expect("$top should parse");

    assert_eq!(query_value(&request, "$top").as_deref(), Some("100"));
  }

  #[test]
  fn ai_get_rejects_unknown_query_options() {
    let error = normalize_ai_get_request("accounts?$select=name&$apply=aggregate(name)")
      .expect_err("unsupported query options must be rejected");

    assert!(error.contains("$apply"));
  }

  #[test]
  fn ai_get_rejects_action_like_paths() {
    let error = normalize_ai_get_request("PublishXml").expect_err("actions must be rejected");

    assert!(error.contains("mutating"));
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(PendingAuthState::default())
    .manage(AiChatState::default())
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
      load_config,
      save_config,
      load_user_settings,
      save_user_settings,
      start_browser_auth,
      complete_browser_auth,
      check_dataverse_connection,
      list_web_resources,
      get_web_resource_content,
      publish_web_resource,
      start_ai_chat_thread,
      send_ai_chat_message,
      dataverse_ai_whoami,
      dataverse_ai_list_entity_sets,
      dataverse_ai_metadata,
      dataverse_ai_get,
      list_fetchxml_entities,
      get_fetchxml_entity_metadata,
      execute_fetchxml_query
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
