use base64::{
  Engine as _,
  engine::general_purpose::{STANDARD as BASE64, URL_SAFE_NO_PAD},
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
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use tauri::{AppHandle, Emitter, Manager, State};
use url::{Url, form_urlencoded};
use uuid::Uuid;

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SolutionSummary {
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
struct SolutionComponentSummary {
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
struct SolutionDependencyItem {
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
struct SolutionDependencyReport {
  required: Vec<SolutionDependencyItem>,
  dependents: Vec<SolutionDependencyItem>,
  delete_blockers: Vec<SolutionDependencyItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SolutionLayer {
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
struct SolutionWebResourceCandidate {
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
struct CreateWebResourceInput {
  solution_unique_name: String,
  name: String,
  display_name: String,
  description: String,
  #[serde(rename = "type")]
  resource_type: String,
  content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SolutionWriteResult {
  #[serde(skip_serializing_if = "Option::is_none")]
  web_resource_id: Option<String>,
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
  provider_thread_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  codex_thread_id: Option<String>,
  provider: String,
  model: String,
  reasoning_effort: String,
  title: String,
  created_at: String,
  updated_at: String,
  messages: Vec<AiChatMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiChatThreadSummary {
  id: String,
  environment_id: String,
  provider: String,
  model: String,
  reasoning_effort: String,
  title: String,
  created_at: String,
  updated_at: String,
  message_count: usize,
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
struct AiProviderToolRequest {
  name: String,
  #[serde(default)]
  arguments: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiProviderTurnResult {
  #[serde(default)]
  provider_thread_id: Option<String>,
  #[serde(default)]
  codex_thread_id: Option<String>,
  #[serde(default)]
  response: String,
  #[serde(default)]
  tool_requests: Vec<AiProviderToolRequest>,
}

impl AiProviderTurnResult {
  fn provider_session_id(&self) -> Option<String> {
    self
      .provider_thread_id
      .clone()
      .or(self.codex_thread_id.clone())
  }
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

fn ai_chat_history_root(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = legacy_opendataverse_dir(app)?.join(AI_CHATS_DIR_NAME);
  fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
  Ok(dir)
}

fn ai_chat_environment_dir(app: &AppHandle, environment_id: &str) -> Result<PathBuf, String> {
  let dir = ai_chat_history_root(app)?.join(safe_storage_segment(environment_id));
  fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
  Ok(dir)
}

fn ai_chat_thread_path(
  app: &AppHandle,
  environment_id: &str,
  thread_id: &str,
) -> Result<PathBuf, String> {
  Ok(
    ai_chat_environment_dir(app, environment_id)?
      .join(format!("{}.json", safe_storage_segment(thread_id))),
  )
}

fn save_ai_chat_thread(app: &AppHandle, thread: &AiChatThread) -> Result<(), String> {
  let environment_id = thread
    .environment_id
    .as_deref()
    .ok_or_else(|| "Cannot save an AI chat without an environment id.".to_string())?;
  let path = ai_chat_thread_path(app, environment_id, &thread.id)?;
  let data = serde_json::to_string_pretty(thread).map_err(|error| error.to_string())?;
  fs::write(path, data).map_err(|error| error.to_string())
}

fn load_ai_chat_thread_from_disk(
  app: &AppHandle,
  environment_id: &str,
  thread_id: &str,
) -> Result<Option<AiChatThread>, String> {
  let path = ai_chat_thread_path(app, environment_id, thread_id)?;
  let data = match fs::read_to_string(&path) {
    Ok(data) => data,
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
    Err(error) => return Err(error.to_string()),
  };
  let thread: AiChatThread = serde_json::from_str(&data).map_err(|error| error.to_string())?;

  if thread.id != thread_id {
    return Err("Saved AI chat id does not match the requested chat.".to_string());
  }

  if thread.environment_id.as_deref() != Some(environment_id) {
    return Err("Saved AI chat belongs to a different environment.".to_string());
  }

  Ok(Some(thread))
}

fn summarize_ai_chat_thread(thread: &AiChatThread) -> Option<AiChatThreadSummary> {
  let environment_id = thread.environment_id.clone()?;

  Some(AiChatThreadSummary {
    id: thread.id.clone(),
    environment_id,
    provider: thread.provider.clone(),
    model: thread.model.clone(),
    reasoning_effort: thread.reasoning_effort.clone(),
    title: thread.title.clone(),
    created_at: thread.created_at.clone(),
    updated_at: thread.updated_at.clone(),
    message_count: thread.messages.len(),
  })
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
    item
      .as_bool()
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

fn solution_component_type_label(component_type: i32) -> &'static str {
  match component_type {
    1 => "Table",
    2 => "Column",
    3 => "Relationship",
    4 => "Column Choice Value",
    5 => "Column Lookup Value",
    6 => "View Column",
    7 => "Localized Label",
    8 => "Relationship Extra Condition",
    9 => "Choice",
    10 => "Table Relationship",
    11 => "Table Relationship Role",
    12 => "Table Relationship Relationship",
    13 => "Managed Property",
    14 => "Table Key",
    16 => "Privilege",
    17 => "Privilege Object Type",
    18 => "Index",
    20 => "Security Role",
    21 => "Role Privilege",
    22 => "Display String",
    23 => "Display String Map",
    24 => "Form",
    25 => "Organization",
    26 => "View",
    29 => "Process",
    31 => "Report",
    32 => "Report Table",
    33 => "Report Category",
    34 => "Report Visibility",
    35 => "Attachment",
    36 => "Email Template",
    37 => "Contract Template",
    38 => "KB Article Template",
    39 => "Mail Merge Template",
    44 => "Duplicate Rule",
    45 => "Duplicate Rule Condition",
    46 => "Table Map",
    47 => "Column Map",
    48 => "Ribbon Command",
    49 => "Ribbon Context Group",
    50 => "Ribbon Customization",
    52 => "Ribbon Rule",
    53 => "Ribbon Tab To Command Map",
    55 => "Ribbon Diff",
    59 => "Chart",
    60 => "System Form",
    61 => "Web Resource",
    62 => "Site Map",
    63 => "Connection Role",
    64 => "Complex Control",
    65 => "Hierarchy Rule",
    66 => "Custom Control",
    68 => "Custom Control Default Config",
    70 => "Field Security Profile",
    71 => "Field Permission",
    90 => "Plugin Type",
    91 => "Plugin Assembly",
    92 => "SDK Message Processing Step",
    93 => "SDK Message Processing Step Image",
    95 => "Service Endpoint",
    150 => "Routing Rule",
    151 => "Routing Rule Item",
    152 => "SLA",
    153 => "SLA Item",
    154 => "Convert Rule",
    155 => "Convert Rule Item",
    161 => "Mobile Offline Profile",
    162 => "Mobile Offline Profile Item",
    165 => "Similarity Rule",
    166 => "Data Source Mapping",
    201 => "SDK Message",
    202 => "SDK Message Filter",
    203 => "SDK Message Pair",
    204 => "SDK Message Request",
    205 => "SDK Message Request Field",
    206 => "SDK Message Response",
    207 => "SDK Message Response Field",
    208 => "Import Map",
    210 => "Web Wizard",
    300 => "Canvas App",
    371 | 372 => "Connector",
    380 => "Environment Variable Definition",
    381 => "Environment Variable Value",
    400 => "AI Project Type",
    401 => "AI Project",
    402 => "AI Configuration",
    430 => "Table Analytics Configuration",
    431 => "Column Image Configuration",
    432 => "Table Image Configuration",
    _ => "Component",
  }
}

fn solution_component_group(component_type: i32) -> &'static str {
  match component_type {
    1 => "Tables",
    2 => "Columns",
    3 | 10 | 11 | 12 => "Relationships",
    4 | 5 | 9 => "Choices",
    14 | 18 => "Keys and Indexes",
    20 | 21 | 70 | 71 => "Security",
    24 | 60 => "Forms",
    26 => "Views",
    29 => "Processes",
    31 | 32 | 33 | 34 => "Reports",
    48 | 49 | 50 | 52 | 53 | 55 => "Ribbon",
    59 => "Charts",
    61 => "Web Resources",
    62 => "Site Maps",
    90 | 91 | 92 | 93 | 95 | 201 | 202 | 203 | 204 | 205 | 206 | 207 => "Developer Extensions",
    300 => "Apps",
    371 | 372 => "Connectors",
    380 | 381 => "Environment Variables",
    400..=402 => "AI",
    _ => "Other",
  }
}

fn dependency_type_label(dependency_type: i32) -> &'static str {
  match dependency_type {
    1 => "Solution Internal",
    2 => "Published",
    4 => "Unpublished",
    _ => "None",
  }
}

fn root_component_behavior_label(value: Option<i32>) -> Option<String> {
  value.map(|behavior| match behavior {
    0 => "Include subcomponents",
    1 => "Do not include subcomponents",
    2 => "Include as shell only",
    _ => "Unknown",
  }.to_string())
}

fn web_resource_record_url(environment: &DataverseEnvironment, entity: &str, object_id: &str) -> String {
  let mut query = form_urlencoded::Serializer::new(String::new());
  query.append_pair("pagetype", "entityrecord");
  query.append_pair("etn", entity);
  query.append_pair("id", object_id);

  format!("{}/main.aspx?{}", normalize_org_url(&environment.url), query.finish())
}

fn guid_from_entity_id(value: &str) -> Option<String> {
  let start = value.rfind('(')? + 1;
  let end = value.rfind(')')?;
  (start < end).then(|| value[start..end].to_string())
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

fn resource_type_code(value: &str) -> Result<i32, String> {
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

fn is_microsoft_web_resource_name(name: &str) -> bool {
  let lower_name = name.trim().to_lowercase();

  [
    "msdyn",
    "microsoft",
    "mscrm",
    "mspp",
    "adx_",
    "cc_",
  ]
  .iter()
  .any(|prefix| lower_name.starts_with(prefix))
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

fn solution_from_value(value: &Value, component_count: Option<usize>) -> SolutionSummary {
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

fn solution_managed_filter(value: Option<&str>) -> Result<&'static str, String> {
  match value.unwrap_or("unmanaged") {
    "all" => Ok("isvisible eq true"),
    "managed" => Ok("isvisible eq true and ismanaged eq true"),
    "unmanaged" => Ok("isvisible eq true and ismanaged eq false"),
    other => Err(format!("Unsupported solution filter: {other}")),
  }
}

async fn solution_component_values(
  app: &AppHandle,
  environment: &DataverseEnvironment,
  solution_id: &str,
) -> Result<Vec<Value>, String> {
  dataverse_get_collection_values(
    app,
    environment,
    "/solutioncomponents",
    vec![
      (
        "$select".to_string(),
        "solutioncomponentid,_solutionid_value,componenttype,objectid,ismetadata,rootcomponentbehavior,rootsolutioncomponentid,createdon,modifiedon,versionnumber".to_string(),
      ),
      (
        "$filter".to_string(),
        format!("_solutionid_value eq {solution_id}"),
      ),
      ("$orderby".to_string(), "componenttype asc,modifiedon desc".to_string()),
    ],
  )
  .await
}

fn solution_component_from_value(value: &Value) -> Option<SolutionComponentSummary> {
  let id = json_string(value, "solutioncomponentid")?;
  let object_id = json_string(value, "objectid")?;
  let solution_id = json_string(value, "_solutionid_value").unwrap_or_default();
  let component_type = json_i32(value, "componenttype").unwrap_or_default();
  let root_component_behavior = json_i32(value, "rootcomponentbehavior");
  let component_type_label = solution_component_type_label(component_type).to_string();

  Some(SolutionComponentSummary {
    id,
    solution_id,
    object_id: object_id.clone(),
    component_type,
    component_type_label: component_type_label.clone(),
    group: solution_component_group(component_type).to_string(),
    display_name: format!("{component_type_label} {}", &object_id[..object_id.len().min(8)]),
    logical_name: None,
    schema_name: None,
    is_managed: None,
    created_on: json_string(value, "createdon"),
    modified_on: json_string(value, "modifiedon"),
    root_component_behavior,
    root_component_behavior_label: root_component_behavior_label(root_component_behavior),
    root_solution_component_id: json_string(value, "rootsolutioncomponentid"),
    version: json_i64(value, "versionnumber").map(|version| version.to_string()),
    related_entity_logical_name: None,
    related_record_url: None,
    layer_name: None,
  })
}

async fn optional_dataverse_get_json_value(
  app: &AppHandle,
  environment: &DataverseEnvironment,
  path: &str,
  query: &[(&str, &str)],
) -> Option<Value> {
  dataverse_get_json_value(app, environment, path, query).await.ok()
}

fn apply_table_detail(component: &mut SolutionComponentSummary, value: &Value) {
  let logical_name = json_string(value, "LogicalName");
  let schema_name = json_string(value, "SchemaName");
  let display_name = localized_label(
    value,
    "DisplayName",
    logical_name.as_deref().unwrap_or(&component.display_name),
  );

  component.display_name = display_name;
  component.logical_name = logical_name.clone();
  component.schema_name = schema_name;
  component.is_managed = json_bool(value, "IsManaged");
  component.modified_on = json_string(value, "ModifiedOn").or_else(|| component.modified_on.clone());
  component.layer_name = logical_name;
}

fn apply_choice_detail(component: &mut SolutionComponentSummary, value: &Value) {
  let name = json_string(value, "Name");
  component.display_name = localized_label(
    value,
    "DisplayName",
    name.as_deref().unwrap_or(&component.display_name),
  );
  component.logical_name = name.clone();
  component.schema_name = name.clone();
  component.is_managed = json_bool(value, "IsManaged");
  component.layer_name = name;
}

fn apply_table_row_detail(
  component: &mut SolutionComponentSummary,
  value: &Value,
  display_keys: &[&str],
  logical_keys: &[&str],
  schema_keys: &[&str],
  entity_logical_name: &str,
  environment: &DataverseEnvironment,
) {
  if let Some(display_name) = display_keys.iter().find_map(|key| json_string(value, key)) {
    component.display_name = display_name;
  }

  component.logical_name = logical_keys.iter().find_map(|key| json_string(value, key));
  component.schema_name = schema_keys.iter().find_map(|key| json_string(value, key));
  component.is_managed = json_bool(value, "ismanaged");
  component.modified_on = json_string(value, "modifiedon").or_else(|| component.modified_on.clone());
  component.related_entity_logical_name = Some(entity_logical_name.to_string());
  component.related_record_url = Some(web_resource_record_url(
    environment,
    entity_logical_name,
    &component.object_id,
  ));
  component.layer_name = component
    .logical_name
    .clone()
    .or_else(|| component.schema_name.clone())
    .or_else(|| Some(component.display_name.clone()));
}

async fn enrich_solution_component(
  app: &AppHandle,
  environment: &DataverseEnvironment,
  component: &mut SolutionComponentSummary,
) {
  match component.component_type {
    1 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/EntityDefinitions({})", component.object_id),
        &[(
          "$select",
          "MetadataId,LogicalName,SchemaName,DisplayName,IsManaged,ModifiedOn",
        )],
      )
      .await
      {
        apply_table_detail(component, &value);
      }
    }
    9 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/GlobalOptionSetDefinitions({})", component.object_id),
        &[("$select", "MetadataId,Name,DisplayName,IsManaged")],
      )
      .await
      {
        apply_choice_detail(component, &value);
      }
    }
    20 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/roles({})", component.object_id),
        &[("$select", "roleid,name,ismanaged,modifiedon")],
      )
      .await
      {
        apply_table_row_detail(
          component,
          &value,
          &["name"],
          &["name"],
          &[],
          "role",
          environment,
        );
      }
    }
    24 | 60 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/systemforms({})", component.object_id),
        &[("$select", "formid,name,objecttypecode,type,ismanaged,modifiedon")],
      )
      .await
      {
        apply_table_row_detail(
          component,
          &value,
          &["name"],
          &["objecttypecode"],
          &[],
          "systemform",
          environment,
        );
      }
    }
    26 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/savedqueries({})", component.object_id),
        &[("$select", "savedqueryid,name,returnedtypecode,ismanaged,modifiedon")],
      )
      .await
      {
        apply_table_row_detail(
          component,
          &value,
          &["name"],
          &["returnedtypecode"],
          &[],
          "savedquery",
          environment,
        );
      }
    }
    29 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/workflows({})", component.object_id),
        &[("$select", "workflowid,name,uniquename,ismanaged,modifiedon")],
      )
      .await
      {
        apply_table_row_detail(
          component,
          &value,
          &["name"],
          &["uniquename"],
          &[],
          "workflow",
          environment,
        );
      }
    }
    61 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/webresourceset({})", component.object_id),
        &[(
          "$select",
          "webresourceid,name,displayname,webresourcetype,ismanaged,createdon,modifiedon",
        )],
      )
      .await
      {
        apply_table_row_detail(
          component,
          &value,
          &["displayname", "name"],
          &["name"],
          &["name"],
          "webresource",
          environment,
        );
      }
    }
    300 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/canvasapps({})", component.object_id),
        &[("$select", "canvasappid,displayname,name,modifiedon")],
      )
      .await
      {
        apply_table_row_detail(
          component,
          &value,
          &["displayname", "name"],
          &["name"],
          &[],
          "canvasapp",
          environment,
        );
      }
    }
    380 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/environmentvariabledefinitions({})", component.object_id),
        &[(
          "$select",
          "environmentvariabledefinitionid,schemaname,displayname,ismanaged,modifiedon",
        )],
      )
      .await
      {
        apply_table_row_detail(
          component,
          &value,
          &["displayname", "schemaname"],
          &["schemaname"],
          &["schemaname"],
          "environmentvariabledefinition",
          environment,
        );
      }
    }
    381 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/environmentvariablevalues({})", component.object_id),
        &[(
          "$select",
          "environmentvariablevalueid,value,_environmentvariabledefinitionid_value,modifiedon",
        )],
      )
      .await
      {
        apply_table_row_detail(
          component,
          &value,
          &["value"],
          &["_environmentvariabledefinitionid_value"],
          &[],
          "environmentvariablevalue",
          environment,
        );
      }
    }
    _ => {}
  }
}

fn dependency_item_from_value(value: &Value) -> Option<SolutionDependencyItem> {
  let dependent_component_type = json_i32(value, "dependentcomponenttype").unwrap_or_default();
  let required_component_type = json_i32(value, "requiredcomponenttype").unwrap_or_default();
  let dependency_type = json_i32(value, "dependencytype").unwrap_or_default();

  Some(SolutionDependencyItem {
    id: json_string(value, "dependencyid")?,
    dependency_type,
    dependency_type_label: dependency_type_label(dependency_type).to_string(),
    dependent_component_type,
    dependent_component_type_label: solution_component_type_label(dependent_component_type)
      .to_string(),
    dependent_component_object_id: json_string(value, "dependentcomponentobjectid")?,
    dependent_component_parent_id: json_string(value, "dependentcomponentparentid"),
    required_component_type,
    required_component_type_label: solution_component_type_label(required_component_type)
      .to_string(),
    required_component_object_id: json_string(value, "requiredcomponentobjectid")?,
    required_component_parent_id: json_string(value, "requiredcomponentparentid"),
  })
}

async fn dependency_function_items(
  app: &AppHandle,
  environment: &DataverseEnvironment,
  function_name: &str,
  object_id: &str,
  component_type: i32,
) -> Result<Vec<SolutionDependencyItem>, String> {
  let path = format!(
    "/{function_name}(ObjectId=@ObjectId,ComponentType=@ComponentType)?@ObjectId={object_id}&@ComponentType={component_type}"
  );
  let response = dataverse_get_json_value(app, environment, &path, &[]).await?;

  Ok(
    response
      .get("value")
      .and_then(Value::as_array)
      .map(|items| items.iter().filter_map(dependency_item_from_value).collect())
      .unwrap_or_default(),
  )
}

fn solution_layer_from_value(value: &Value) -> Option<SolutionLayer> {
  Some(SolutionLayer {
    id: json_string(value, "msdyn_componentlayerid")?,
    name: json_string(value, "msdyn_name").unwrap_or_else(|| "Layer".to_string()),
    component_name: json_string(value, "msdyn_solutioncomponentname"),
    solution_name: json_string(value, "msdyn_solutionname"),
    publisher_name: json_string(value, "msdyn_publishername"),
    order: json_i32(value, "msdyn_order"),
    overwrite_time: json_string(value, "msdyn_overwritetime"),
    changes: json_string(value, "msdyn_changes"),
  })
}

fn normalize_ai_provider(provider: Option<&str>) -> Result<String, String> {
  let provider = provider
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or(AI_DEFAULT_PROVIDER);

  match provider {
    "codex" | "claude" => Ok(provider.to_string()),
    _ => Err(format!("Unsupported AI provider: {provider}")),
  }
}

fn normalize_ai_model(provider: &str, model: Option<&str>) -> Result<String, String> {
  let default_model = match provider {
    "claude" => AI_DEFAULT_CLAUDE_MODEL,
    _ => AI_DEFAULT_MODEL,
  };
  let model = model
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or(default_model);

  match provider {
    "codex" => match model {
      "gpt-5.5" | "gpt-5.4" | "gpt-5.4-mini" | "gpt-5.3-codex-spark" => Ok(model.to_string()),
      _ => Err(format!("Unsupported Codex model: {model}")),
    },
    "claude" => match model {
      "claude-fable-5"
      | "claude-opus-4-8"
      | "claude-opus-4-7"
      | "claude-opus-4-6"
      | "claude-opus-4-5-20251101"
      | "claude-opus-4-5"
      | "claude-sonnet-4-6"
      | "claude-sonnet-4-5-20250929"
      | "claude-sonnet-4-5"
      | "claude-haiku-4-5-20251001"
      | "claude-haiku-4-5" => Ok(model.to_string()),
      _ => Err(format!("Unsupported Claude model: {model}")),
    },
    _ => Err(format!("Unsupported AI provider: {provider}")),
  }
}

fn normalize_ai_reasoning_effort(
  provider: &str,
  reasoning_effort: Option<&str>,
) -> Result<String, String> {
  let default_reasoning_effort = match provider {
    "claude" => AI_DEFAULT_CLAUDE_REASONING_EFFORT,
    _ => AI_DEFAULT_REASONING_EFFORT,
  };
  let reasoning_effort = reasoning_effort
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or(default_reasoning_effort);

  match provider {
    "codex" => match reasoning_effort {
      "low" | "medium" | "high" | "xhigh" => Ok(reasoning_effort.to_string()),
      _ => Err(format!(
        "Unsupported Codex reasoning effort: {reasoning_effort}"
      )),
    },
    "claude" => match reasoning_effort {
      "low" | "medium" | "high" | "xhigh" | "max" => Ok(reasoning_effort.to_string()),
      _ => Err(format!(
        "Unsupported Claude reasoning effort: {reasoning_effort}"
      )),
    },
    _ => Err(format!("Unsupported AI provider: {provider}")),
  }
}

fn create_ai_chat_thread(
  environment_id: Option<String>,
  provider: Option<&str>,
  model: Option<&str>,
  reasoning_effort: Option<&str>,
  provider_thread_id: Option<String>,
) -> Result<AiChatThread, String> {
  let now = now_rfc3339()?;
  let provider = normalize_ai_provider(provider)?;
  let model = normalize_ai_model(&provider, model)?;
  let reasoning_effort = normalize_ai_reasoning_effort(&provider, reasoning_effort)?;

  Ok(AiChatThread {
    id: format!("ai-thread-{}", Uuid::new_v4()),
    environment_id,
    provider_thread_id: provider_thread_id.clone(),
    codex_thread_id: if provider == "codex" {
      provider_thread_id
    } else {
      None
    },
    provider,
    model,
    reasoning_effort,
    title: "Dataverse Chat".to_string(),
    created_at: now.clone(),
    updated_at: now,
    messages: Vec::new(),
  })
}

fn ai_chat_title_from_message(message: &str) -> String {
  let normalized = message
    .split_whitespace()
    .collect::<Vec<_>>()
    .join(" ")
    .trim()
    .to_string();

  if normalized.is_empty() {
    return "Dataverse Chat".to_string();
  }

  let mut title = normalized.chars().take(80).collect::<String>();
  if normalized.chars().count() > 80 {
    title.push_str("...");
  }
  title
}

fn maybe_update_ai_chat_title(thread: &mut AiChatThread, message: &str) {
  if thread.messages.is_empty() || thread.title == "Dataverse Chat" {
    thread.title = ai_chat_title_from_message(message);
  }
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

  #[cfg(target_os = "windows")]
  command.creation_flags(CREATE_NO_WINDOW);

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

fn user_safe_claude_error(error: String) -> String {
  let redacted = redact_sensitive_error(&error);
  let lower = redacted.to_lowercase();

  if lower.contains("authentication")
    || lower.contains("not logged in")
    || lower.contains("api key")
    || lower.contains("anthropic")
    || lower.contains("claude auth login")
  {
    return "Claude could not read your local Claude credentials. Run `claude auth login` once and restart OpenDataverse.".to_string();
  }

  redacted
}

fn user_safe_ai_provider_error(provider: &str, error: String) -> String {
  match provider {
    "codex" => user_safe_codex_error(error),
    "claude" => user_safe_claude_error(error),
    _ => user_safe_ai_error(error),
  }
}

fn ai_provider_display_name(provider: &str) -> &'static str {
  match provider {
    "claude" => "Claude",
    _ => "Codex",
  }
}

fn update_ai_thread_provider_thread_id(
  thread: &mut AiChatThread,
  provider_thread_id: Option<String>,
) {
  if let Some(provider_thread_id) = provider_thread_id {
    thread.provider_thread_id = Some(provider_thread_id.clone());
    if thread.provider == "codex" {
      thread.codex_thread_id = Some(provider_thread_id);
    }
  }
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

fn run_ai_provider_turn(
  app: &AppHandle,
  state: &State<'_, AiChatState>,
  thread: &AiChatThread,
  environment: &DataverseEnvironment,
  message: &str,
  tool_results: Vec<Value>,
) -> Result<AiProviderTurnResult, String> {
  let provider_thread_id = thread
    .provider_thread_id
    .clone()
    .or(thread.codex_thread_id.clone());
  let result = run_ai_sidecar_stream_request(
    app,
    state,
    "run_turn_stream",
    serde_json::json!({
      "threadId": thread.id,
      "provider": thread.provider,
      "providerThreadId": provider_thread_id,
      "codexThreadId": thread.codex_thread_id,
      "environmentId": environment.id,
      "message": message,
      "model": thread.model,
      "reasoningEffort": thread.reasoning_effort,
      "toolResults": tool_results,
    }),
    |_event| {},
  )
  .map_err(|error| user_safe_ai_provider_error(&thread.provider, error))?;

  serde_json::from_value(result).map_err(|error| {
    format!(
      "Parse {} sidecar response: {error}",
      ai_provider_display_name(&thread.provider)
    )
  })
}

async fn execute_ai_tool_request(
  app: &AppHandle,
  thread_id: &str,
  environment: &DataverseEnvironment,
  request: &AiProviderToolRequest,
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

async fn build_ai_chat_response(
  app: &AppHandle,
  state: &State<'_, AiChatState>,
  thread: &mut AiChatThread,
  environment: &DataverseEnvironment,
  message: &str,
) -> Result<Vec<AiChatMessage>, String> {
  let mut messages = Vec::new();
  let provider_tool_name = thread.provider.clone();
  let provider_display_name = ai_provider_display_name(&thread.provider);
  let provider_turn_message = create_ai_tool_message(
    &provider_tool_name,
    "run_turn",
    "streaming",
    Some(serde_json::json!({
      "provider": thread.provider,
      "model": thread.model,
      "reasoningEffort": thread.reasoning_effort,
    })),
  )?;
  emit_ai_chat_message(app, &thread.id, &provider_turn_message);
  let first_turn = run_ai_provider_turn(app, state, thread, environment, message, Vec::new())?;
  update_ai_thread_provider_thread_id(thread, first_turn.provider_session_id());
  let mut provider_turn_message = mark_ai_message_status(&provider_turn_message, "complete");
  provider_turn_message.metadata = Some(serde_json::json!({
    "provider": thread.provider,
    "providerThreadId": thread.provider_thread_id,
    "toolRequestCount": first_turn.tool_requests.len(),
    "model": thread.model,
    "reasoningEffort": thread.reasoning_effort,
  }));
  emit_ai_chat_message(app, &thread.id, &provider_turn_message);
  messages.push(provider_turn_message);

  if first_turn.tool_requests.is_empty() {
    let response = first_turn.response.trim();
    let assistant_message = create_ai_message(
      "assistant",
      if response.is_empty() {
        format!("{provider_display_name} completed the turn without a response.")
      } else {
        response.to_string()
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
      execute_ai_tool_request(app, &thread.id, environment, request).await?;
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

  let provider_summary_message = create_ai_tool_message(
    &provider_tool_name,
    "run_turn_with_tool_results",
    "streaming",
    Some(serde_json::json!({
      "provider": thread.provider,
      "model": thread.model,
      "reasoningEffort": thread.reasoning_effort,
      "toolResultCount": tool_results.len(),
    })),
  )?;
  emit_ai_chat_message(app, &thread.id, &provider_summary_message);
  let final_turn = run_ai_provider_turn(
    app,
    state,
    thread,
    environment,
    message,
    tool_results.clone(),
  )?;
  update_ai_thread_provider_thread_id(thread, final_turn.provider_session_id());
  let mut provider_summary_message = mark_ai_message_status(&provider_summary_message, "complete");
  provider_summary_message.metadata = Some(serde_json::json!({
    "provider": thread.provider,
    "providerThreadId": thread.provider_thread_id,
    "toolResultCount": tool_results.len(),
    "model": thread.model,
    "reasoningEffort": thread.reasoning_effort,
  }));
  emit_ai_chat_message(app, &thread.id, &provider_summary_message);
  messages.push(provider_summary_message);

  let response = final_turn.response.trim();
  let assistant_message = create_ai_message(
    "assistant",
    if response.is_empty() {
      format!(
        "{provider_display_name} received the Dataverse tool results but did not return a summary."
      )
    } else {
      response.to_string()
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

async fn patch_web_resource_content(
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

async fn publish_web_resource_by_id(
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
async fn save_web_resource_content(
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
  patch_web_resource_content(&app, &environment, &binding.web_resource_id, &bytes).await?;
  publish_web_resource_by_id(&app, &environment, &binding.web_resource_id).await?;

  Ok(PublishResult {
    web_resource_id: binding.web_resource_id,
    web_resource_name: binding.web_resource_name.clone(),
    message: format!("Published {}", binding.web_resource_name),
  })
}

#[tauri::command]
async fn list_solutions(
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

  Ok(
    values
      .iter()
      .map(|value| solution_from_value(value, None))
      .collect(),
  )
}

#[tauri::command]
async fn list_solution_components(
  app: AppHandle,
  environment: DataverseEnvironment,
  solution_id: String,
) -> Result<Vec<SolutionComponentSummary>, String> {
  let values = solution_component_values(&app, &environment, &solution_id).await?;
  let mut components = Vec::new();

  for value in values {
    if let Some(mut component) = solution_component_from_value(&value) {
      enrich_solution_component(&app, &environment, &mut component).await;
      components.push(component);
    }
  }

  components.sort_by(|left, right| {
    left
      .group
      .cmp(&right.group)
      .then_with(|| left.display_name.to_lowercase().cmp(&right.display_name.to_lowercase()))
      .then_with(|| left.object_id.cmp(&right.object_id))
  });

  Ok(components)
}

#[tauri::command]
async fn get_solution_component_dependencies(
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
async fn get_solution_component_layers(
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

  Ok(values.iter().filter_map(solution_layer_from_value).collect())
}

#[tauri::command]
async fn list_solution_web_resource_candidates(
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
        "ismanaged eq false and (webresourcetype eq 1 or webresourcetype eq 2 or webresourcetype eq 3 or webresourcetype eq 4 or webresourcetype eq 11 or webresourcetype eq 12)".to_string(),
      ),
      ("$orderby".to_string(), "name asc".to_string()),
    ],
  )
  .await?;

  Ok(
    values
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
      .collect(),
  )
}

#[tauri::command]
async fn add_existing_web_resource_to_solution(
  app: AppHandle,
  environment: DataverseEnvironment,
  solution_unique_name: String,
  web_resource_id: String,
) -> Result<SolutionWriteResult, String> {
  let solution_unique_name = validate_logical_name(&solution_unique_name)?;
  let resource = dataverse_get_json_value(
    &app,
    &environment,
    &format!("/webresourceset({web_resource_id})"),
    &[("$select", "webresourceid,name,ismanaged")],
  )
  .await?;
  let resource_name = json_string(&resource, "name").unwrap_or_default();

  if json_bool(&resource, "ismanaged").unwrap_or(false) {
    return Err("Managed web resources cannot be added from Solution Explorer.".to_string());
  }

  if is_microsoft_web_resource_name(&resource_name) {
    return Err("Microsoft web resources cannot be added from Solution Explorer.".to_string());
  }

  dataverse_json_request(
    &app,
    &environment,
    reqwest::Method::POST,
    "/AddSolutionComponent",
    &serde_json::json!({
      "ComponentId": web_resource_id,
      "ComponentType": 61,
      "SolutionUniqueName": solution_unique_name,
      "AddRequiredComponents": false,
      "DoNotIncludeSubcomponents": true
    }),
  )
  .await?;

  Ok(SolutionWriteResult {
    web_resource_id: Some(web_resource_id),
    message: format!("Added web resource to {solution_unique_name}"),
  })
}

#[tauri::command]
async fn create_web_resource_in_solution(
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
  let content = BASE64.encode(input.content.as_bytes());
  let mut payload = serde_json::json!({
    "name": name,
    "webresourcetype": type_code,
    "content": content,
  });

  if !display_name.is_empty() {
    payload["displayname"] = Value::String(display_name.to_string());
  }

  if !description.is_empty() {
    payload["description"] = Value::String(description.to_string());
  }

  let (body, entity_id) = dataverse_post_json_with_headers(
    &app,
    &environment,
    "/webresourceset",
    &payload,
    &[
      ("MSCRM.SolutionUniqueName", solution_unique_name.clone()),
      ("Prefer", "return=representation".to_string()),
    ],
  )
  .await?;
  let web_resource_id = serde_json::from_str::<Value>(&body)
    .ok()
    .and_then(|value| json_string(&value, "webresourceid"))
    .or_else(|| entity_id.as_deref().and_then(guid_from_entity_id));

  Ok(SolutionWriteResult {
    web_resource_id,
    message: format!("Created {name} in {solution_unique_name}"),
  })
}

#[tauri::command]
fn list_ai_chat_threads(
  app: AppHandle,
  environment_id: String,
) -> Result<Vec<AiChatThreadSummary>, String> {
  let dir = ai_chat_environment_dir(&app, &environment_id)?;
  let entries = match fs::read_dir(&dir) {
    Ok(entries) => entries,
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
    Err(error) => return Err(error.to_string()),
  };
  let mut summaries = Vec::new();

  for entry in entries {
    let entry = entry.map_err(|error| error.to_string())?;
    let path = entry.path();
    if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
      continue;
    }

    let data = match fs::read_to_string(&path) {
      Ok(data) => data,
      Err(_) => continue,
    };
    let thread = match serde_json::from_str::<AiChatThread>(&data) {
      Ok(thread) => thread,
      Err(_) => continue,
    };
    if thread.environment_id.as_deref() != Some(environment_id.as_str()) {
      continue;
    }
    if let Some(summary) = summarize_ai_chat_thread(&thread) {
      summaries.push(summary);
    }
  }

  summaries.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
  Ok(summaries)
}

#[tauri::command]
fn load_ai_chat_thread(
  app: AppHandle,
  state: State<'_, AiChatState>,
  environment_id: String,
  thread_id: String,
) -> Result<AiChatThread, String> {
  let thread = load_ai_chat_thread_from_disk(&app, &environment_id, &thread_id)?
    .ok_or_else(|| "Saved AI chat was not found.".to_string())?;
  state
    .threads
    .lock()
    .map_err(|error| error.to_string())?
    .insert(thread.id.clone(), thread.clone());

  Ok(thread)
}

#[tauri::command]
fn start_ai_chat_thread(
  state: State<'_, AiChatState>,
  environment_id: Option<String>,
  provider: Option<String>,
  model: Option<String>,
  reasoning_effort: Option<String>,
  provider_thread_id: Option<String>,
) -> Result<AiChatThread, String> {
  let thread = create_ai_chat_thread(
    environment_id,
    provider.as_deref(),
    model.as_deref(),
    reasoning_effort.as_deref(),
    provider_thread_id,
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
  context: Option<String>,
  provider: Option<String>,
  model: Option<String>,
  reasoning_effort: Option<String>,
  provider_thread_id: Option<String>,
  codex_thread_id: Option<String>,
) -> Result<Vec<AiChatMessage>, String> {
  let trimmed = message.trim();
  if trimmed.is_empty() {
    return Err("Message is required.".to_string());
  }

  let environment = environment_by_id(&app, environment_id.as_deref())?;
  let requested_provider = normalize_ai_provider(provider.as_deref())?;
  let provider_thread_id = provider_thread_id.or(codex_thread_id);
  let existing_thread = state
    .threads
    .lock()
    .map_err(|error| error.to_string())?
    .remove(&thread_id);
  let mut thread = if let Some(thread) = existing_thread {
    thread
  } else if let Some(thread) = load_ai_chat_thread_from_disk(&app, &environment.id, &thread_id)? {
    thread
  } else {
    let model = normalize_ai_model(&requested_provider, model.as_deref())?;
    let reasoning_effort =
      normalize_ai_reasoning_effort(&requested_provider, reasoning_effort.as_deref())?;
    let mut thread = create_ai_chat_thread(
      Some(environment.id.clone()),
      Some(&requested_provider),
      Some(&model),
      Some(&reasoning_effort),
      provider_thread_id.clone(),
    )?;
    thread.id = thread_id.clone();
    thread
  };

  if !thread.messages.is_empty() && thread.provider != requested_provider {
    let existing = ai_provider_display_name(&thread.provider);
    let requested = ai_provider_display_name(&requested_provider);
    state
      .threads
      .lock()
      .map_err(|error| error.to_string())?
      .insert(thread.id.clone(), thread);
    return Err(format!(
      "This AI chat is locked to {existing}. Clear the chat before starting a {requested} conversation."
    ));
  }

  let model = normalize_ai_model(&requested_provider, model.as_deref())?;
  let reasoning_effort =
    normalize_ai_reasoning_effort(&requested_provider, reasoning_effort.as_deref())?;
  thread.environment_id = Some(environment.id.clone());
  if thread.messages.is_empty() && thread.provider != requested_provider {
    thread.provider_thread_id = None;
    thread.codex_thread_id = None;
  }
  thread.provider = requested_provider;
  update_ai_thread_provider_thread_id(&mut thread, provider_thread_id);
  thread.model = model;
  thread.reasoning_effort = reasoning_effort;
  maybe_update_ai_chat_title(&mut thread, trimmed);
  thread
    .messages
    .push(create_ai_message("user", trimmed, "complete")?);
  let provider_message = context
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(|context| format!("{context}\n\nUser question: {trimmed}"))
    .unwrap_or_else(|| trimmed.to_string());

  let response_messages =
    match build_ai_chat_response(&app, &state, &mut thread, &environment, &provider_message).await {
      Ok(messages) => messages,
      Err(error) => vec![
        create_ai_tool_message(&thread.provider, "run_turn", "error", None)?,
        create_ai_message(
          "assistant",
          format!(
            "{} request failed: {}",
            ai_provider_display_name(&thread.provider),
            user_safe_ai_provider_error(&thread.provider, error)
          ),
          "error",
        )?,
      ],
    };
  thread.messages.extend(response_messages);
  thread.updated_at = now_rfc3339()?;
  if let Err(error) = save_ai_chat_thread(&app, &thread) {
    thread.messages.push(create_ai_message(
      "assistant",
      format!("AI response completed, but chat history was not saved: {error}"),
      "error",
    )?);
    thread.updated_at = now_rfc3339()?;
  }

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
  relationships
    .retain(|relationship| is_valid_designer_relationship(relationship, &advanced_find_entities));
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

  #[test]
  fn safe_storage_segment_removes_path_characters() {
    assert_eq!(safe_storage_segment("../environment/id"), "environment_id");
    assert_eq!(safe_storage_segment(""), "unknown");
  }

  #[test]
  fn ai_chat_title_is_generated_from_first_message() {
    assert_eq!(
      ai_chat_title_from_message("  Who   am I connected as?  "),
      "Who am I connected as?"
    );

    let long_title = ai_chat_title_from_message(&"a".repeat(120));
    assert!(long_title.ends_with("..."));
    assert!(long_title.len() <= 83);
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
      save_web_resource_content,
      publish_web_resource,
      list_solutions,
      list_solution_components,
      get_solution_component_dependencies,
      get_solution_component_layers,
      list_solution_web_resource_candidates,
      add_existing_web_resource_to_solution,
      create_web_resource_in_solution,
      list_ai_chat_threads,
      load_ai_chat_thread,
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
