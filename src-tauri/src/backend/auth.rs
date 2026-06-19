use super::*;

#[tauri::command]
pub(super) fn load_config(app: AppHandle) -> Result<AppConfig, String> {
    let path = config_path(&app)?;

    if !path.exists() {
        let legacy_home_path = legacy_home_config_path(&app)?;
        if legacy_home_path.exists() {
            let legacy_data =
                fs::read_to_string(&legacy_home_path).map_err(|error| error.to_string())?;
            if !legacy_data.trim().is_empty() {
                fs::write(&path, &legacy_data).map_err(|error| error.to_string())?;
                return serde_json::from_str(&legacy_data).map_err(|error| error.to_string());
            }
        }

        let legacy_path = legacy_config_path(&app)?;
        if legacy_path.exists() {
            let legacy_data =
                fs::read_to_string(&legacy_path).map_err(|error| error.to_string())?;
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
pub(super) fn save_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    let path = config_path(&app)?;
    let data = serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?;
    fs::write(path, data).map_err(|error| error.to_string())
}

#[tauri::command]
pub(super) fn delete_environment_token(
    app: AppHandle,
    environment_id: String,
) -> Result<(), String> {
    delete_token_file(token_path(&app, &environment_id)?)?;
    delete_token_file(legacy_home_token_path(&app, &environment_id)?)?;
    delete_token_file(legacy_token_path(&app, &environment_id)?)?;
    Ok(())
}

#[tauri::command]
pub(super) fn load_user_settings(app: AppHandle) -> Result<UserSettings, String> {
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
pub(super) fn save_user_settings(app: AppHandle, settings: UserSettings) -> Result<(), String> {
    let path = user_settings_path(&app)?;
    let data = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    fs::write(path, data).map_err(|error| error.to_string())
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
