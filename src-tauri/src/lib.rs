use base64::{
  engine::general_purpose::{STANDARD as BASE64, URL_SAFE_NO_PAD},
  Engine as _,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
  collections::HashMap,
  fs,
  io::{Read, Write},
  net::TcpListener,
  path::PathBuf,
  sync::{Arc, Mutex},
  time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};
use url::Url;
use uuid::Uuid;

const CONFIG_FILE_NAME: &str = "config.json";
const USER_SETTINGS_FILE_NAME: &str = "user-settings.json";
const APP_HOME_DIR_NAME: &str = ".openDataverse";
const LEGACY_APP_HOME_DIR_NAME: &str = ".OpenDataverse";
const TOKENS_DIR_NAME: &str = "tokens";
const CLIENT_ID: &str = "51f81489-12ee-4a9e-aaae-a2591f45987d";
const AUTHORITY_BASE: &str = "https://login.microsoftonline.com/common";
const REDIRECT_URI: &str = "http://localhost:8400";

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

fn now_unix() -> Result<i64, String> {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs() as i64)
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
  let bytes_read = stream.read(&mut buffer).map_err(|error| error.to_string())?;
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
  app.path().app_config_dir().map_err(|error| error.to_string())
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
  auth_url.query_pairs_mut()
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
    return Err(format!("Auth code token exchange failed ({status}): {body}"));
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

  let response: WebResourceApiResponse =
    serde_json::from_str(&body).map_err(|error| format!("Parse web resources response: {error}"))?;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(PendingAuthState::default())
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
      publish_web_resource
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
