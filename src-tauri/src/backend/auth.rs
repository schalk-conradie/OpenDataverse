use super::{
    dataverse::{
        auth_scope, dataverse_get, now_unix, token_from_response, TokenResponse, AUTHORITY_BASE,
        CLIENT_ID, REDIRECT_URI,
    },
    storage::{save_token, DataverseEnvironment},
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    io::{Read, Write},
    net::TcpListener,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, State};
use url::Url;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AuthSession {
    environment_id: String,
    status: String,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct BrowserAuthStart {
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
pub(super) struct PendingAuthState {
    sessions: Mutex<HashMap<String, PendingBrowserAuth>>,
}

#[derive(Debug, Deserialize)]
struct WhoAmIResponse {
    #[serde(rename = "UserId")]
    user_id: String,
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

#[tauri::command]
pub(super) async fn start_browser_auth(
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
pub(super) async fn complete_browser_auth(
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
        serde_json::from_str::<TokenResponse>(&body)
            .map_err(|error| format!("Parse token response: {error}"))?,
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
pub(super) async fn check_dataverse_connection(
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
