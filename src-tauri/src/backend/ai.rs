use super::auth::load_config;
use super::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AiChatMessage {
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
pub(super) struct AiChatThread {
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
pub(super) struct AiChatThreadSummary {
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
pub(super) struct AiChatStreamEvent {
    thread_id: String,
    message: AiChatMessage,
}

#[derive(Default)]
pub(super) struct AiChatState {
    threads: Mutex<HashMap<String, AiChatThread>>,
    sidecar: Mutex<Option<AiSidecarProcess>>,
}

#[derive(Debug)]
pub(super) struct AiGetRequest {
    path: String,
    query: Vec<(String, String)>,
}

pub(super) struct AiSidecarProcess {
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
pub(super) struct AiSidecarResponse {
    id: String,
    ok: Option<bool>,
    result: Option<Value>,
    error: Option<String>,
    event: Option<Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AiProviderToolRequest {
    name: String,
    #[serde(default)]
    arguments: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AiProviderTurnResult {
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
        self.provider_thread_id
            .clone()
            .or(self.codex_thread_id.clone())
    }
}
pub(super) fn ai_chat_history_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = legacy_opendataverse_dir(app)?.join(AI_CHATS_DIR_NAME);
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

pub(super) fn ai_chat_environment_dir(
    app: &AppHandle,
    environment_id: &str,
) -> Result<PathBuf, String> {
    let dir = ai_chat_history_root(app)?.join(safe_storage_segment(environment_id));
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

pub(super) fn ai_chat_thread_path(
    app: &AppHandle,
    environment_id: &str,
    thread_id: &str,
) -> Result<PathBuf, String> {
    Ok(ai_chat_environment_dir(app, environment_id)?
        .join(format!("{}.json", safe_storage_segment(thread_id))))
}

pub(super) fn save_ai_chat_thread(app: &AppHandle, thread: &AiChatThread) -> Result<(), String> {
    let environment_id = thread
        .environment_id
        .as_deref()
        .ok_or_else(|| "Cannot save an AI chat without an environment id.".to_string())?;
    let path = ai_chat_thread_path(app, environment_id, &thread.id)?;
    let data = serde_json::to_string_pretty(thread).map_err(|error| error.to_string())?;
    fs::write(path, data).map_err(|error| error.to_string())
}

pub(super) fn load_ai_chat_thread_from_disk(
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

pub(super) fn summarize_ai_chat_thread(thread: &AiChatThread) -> Option<AiChatThreadSummary> {
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
pub(super) fn normalize_ai_provider(provider: Option<&str>) -> Result<String, String> {
    let provider = provider
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(AI_DEFAULT_PROVIDER);

    match provider {
        "codex" | "claude" => Ok(provider.to_string()),
        _ => Err(format!("Unsupported AI provider: {provider}")),
    }
}

pub(super) fn normalize_ai_model(provider: &str, model: Option<&str>) -> Result<String, String> {
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

pub(super) fn normalize_ai_reasoning_effort(
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

pub(super) fn create_ai_chat_thread(
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

pub(super) fn ai_chat_title_from_message(message: &str) -> String {
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

pub(super) fn maybe_update_ai_chat_title(thread: &mut AiChatThread, message: &str) {
    if thread.messages.is_empty() || thread.title == "Dataverse Chat" {
        thread.title = ai_chat_title_from_message(message);
    }
}

pub(super) fn create_ai_message(
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

pub(super) fn create_ai_tool_message(
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

pub(super) fn emit_ai_chat_message(app: &AppHandle, thread_id: &str, message: &AiChatMessage) {
    let _ = app.emit(
        AI_CHAT_EVENT,
        AiChatStreamEvent {
            thread_id: thread_id.to_string(),
            message: message.clone(),
        },
    );
}

pub(super) fn mark_ai_message_status(message: &AiChatMessage, status: &str) -> AiChatMessage {
    let mut next = message.clone();
    next.status = Some(status.to_string());
    next
}

pub(super) fn ai_sidecar_script_path(app: &AppHandle) -> Result<PathBuf, String> {
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

pub(super) fn ai_node_command() -> String {
    env::var("OPENDATAVERSE_AI_NODE").unwrap_or_else(|_| "node".to_string())
}

pub(super) fn spawn_ai_sidecar(app: &AppHandle) -> Result<AiSidecarProcess, String> {
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

pub(super) fn ensure_ai_sidecar<'a>(
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

pub(super) fn run_ai_sidecar_stream_request(
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

        return Err(response
            .error
            .unwrap_or_else(|| "AI sidecar request failed.".to_string()));
    }
}

pub(super) fn environment_by_id(
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

pub(super) fn redact_sensitive_error(error: &str) -> String {
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

pub(super) fn user_safe_ai_error(error: String) -> String {
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

pub(super) fn user_safe_codex_error(error: String) -> String {
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

pub(super) fn user_safe_claude_error(error: String) -> String {
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

pub(super) fn user_safe_ai_provider_error(provider: &str, error: String) -> String {
    match provider {
        "codex" => user_safe_codex_error(error),
        "claude" => user_safe_claude_error(error),
        _ => user_safe_ai_error(error),
    }
}

pub(super) fn ai_provider_display_name(provider: &str) -> &'static str {
    match provider {
        "claude" => "Claude",
        _ => "Codex",
    }
}

pub(super) fn update_ai_thread_provider_thread_id(
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

pub(super) fn is_sensitive_json_key(key: &str) -> bool {
    let lower = key.to_lowercase();
    lower == "authorization"
        || lower == "access_token"
        || lower == "refresh_token"
        || lower == "id_token"
        || lower == "client_secret"
        || lower.ends_with("token")
}

pub(super) fn sanitize_json_value(value: Value) -> Value {
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

pub(super) fn parse_dataverse_json(body: &str) -> Result<Value, String> {
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

pub(super) fn is_allowed_ai_query_option(key: &str) -> bool {
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

pub(super) fn ai_get_display_path(request: &AiGetRequest) -> String {
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

pub(super) async fn dataverse_ai_whoami_value(
    app: &AppHandle,
    environment: &DataverseEnvironment,
) -> Result<Value, String> {
    let body = dataverse_get(app, environment, "/WhoAmI", &[])
        .await
        .map_err(user_safe_ai_error)?;

    parse_dataverse_json(&body).map_err(user_safe_ai_error)
}

pub(super) async fn dataverse_ai_list_entity_sets_value(
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

pub(super) async fn dataverse_ai_metadata_value(
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

pub(super) async fn dataverse_ai_get_value(
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

pub(super) fn ai_tool_argument(arguments: &Value, name: &str) -> Option<String> {
    arguments
        .get(name)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

pub(super) fn run_ai_provider_turn(
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

pub(super) async fn execute_ai_tool_request(
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

pub(super) async fn build_ai_chat_response(
    app: &AppHandle,
    state: &State<'_, AiChatState>,
    thread: &mut AiChatThread,
    environment: &DataverseEnvironment,
    message: &str,
) -> Result<Vec<AiChatMessage>, String> {
    let mut messages = Vec::new();
    let provider_tool_name = thread.provider.clone();
    let provider_display_name = ai_provider_display_name(&thread.provider);
    let mut tool_results = Vec::new();
    let mut completed_tool_rounds = 0;

    loop {
        let provider_operation = if completed_tool_rounds == 0 {
            "run_turn"
        } else {
            "run_turn_with_tool_results"
        };
        let mut provider_metadata = serde_json::json!({
          "provider": thread.provider,
          "model": thread.model,
          "reasoningEffort": thread.reasoning_effort,
          "toolRound": completed_tool_rounds,
        });
        if completed_tool_rounds > 0 {
            if let Some(metadata) = provider_metadata.as_object_mut() {
                metadata.insert(
                    "toolResultCount".to_string(),
                    serde_json::json!(tool_results.len()),
                );
            }
        }

        let provider_turn_message = create_ai_tool_message(
            &provider_tool_name,
            provider_operation,
            "streaming",
            Some(provider_metadata),
        )?;
        emit_ai_chat_message(app, &thread.id, &provider_turn_message);
        let turn = run_ai_provider_turn(
            app,
            state,
            thread,
            environment,
            message,
            tool_results.clone(),
        )?;
        update_ai_thread_provider_thread_id(thread, turn.provider_session_id());
        let mut provider_turn_message = mark_ai_message_status(&provider_turn_message, "complete");
        provider_turn_message.metadata = Some(serde_json::json!({
          "provider": thread.provider,
          "providerThreadId": thread.provider_thread_id,
          "toolRequestCount": turn.tool_requests.len(),
          "toolResultCount": tool_results.len(),
          "toolRound": completed_tool_rounds,
          "model": thread.model,
          "reasoningEffort": thread.reasoning_effort,
        }));
        emit_ai_chat_message(app, &thread.id, &provider_turn_message);
        messages.push(provider_turn_message);

        if turn.tool_requests.is_empty() {
            let response = turn.response.trim();
            let fallback = if completed_tool_rounds == 0 {
                format!("{provider_display_name} completed the turn without a response.")
            } else {
                format!(
          "{provider_display_name} received the Dataverse tool results but did not return a summary."
        )
            };
            let assistant_message = create_ai_message(
                "assistant",
                if response.is_empty() {
                    fallback
                } else {
                    response.to_string()
                },
                "complete",
            )?;
            emit_ai_chat_message(app, &thread.id, &assistant_message);
            messages.push(assistant_message);
            return Ok(messages);
        }

        if completed_tool_rounds >= AI_MAX_TOOL_ROUNDS {
            let response = turn.response.trim();
            let limit_message = format!(
        "{provider_display_name} still needs more Dataverse reads after {AI_MAX_TOOL_ROUNDS} tool rounds. Narrow the request and try again."
      );
            let content = if response.is_empty() {
                limit_message
            } else {
                format!("{response}\n\n_{limit_message}_")
            };
            let assistant_message = create_ai_message("assistant", content, "complete")?;
            emit_ai_chat_message(app, &thread.id, &assistant_message);
            messages.push(assistant_message);
            return Ok(messages);
        }

        let mut next_tool_results = Vec::new();
        for request in turn.tool_requests.iter().take(AI_TOOL_REQUESTS_PER_ROUND) {
            let (tool_message, tool_result) =
                execute_ai_tool_request(app, &thread.id, environment, request).await?;
            messages.push(tool_message);
            next_tool_results.push(tool_result);
        }

        if turn.tool_requests.len() > AI_TOOL_REQUESTS_PER_ROUND {
            next_tool_results.push(serde_json::json!({
        "name": "tool_limit",
        "arguments": {},
        "ok": false,
        "error": format!(
          "OpenDataverse executed only the first {AI_TOOL_REQUESTS_PER_ROUND} tool requests for this turn."
        ),
      }));
        }

        tool_results = next_tool_results;
        completed_tool_rounds += 1;
    }
}
#[tauri::command]
pub(super) fn list_ai_chat_threads(
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
pub(super) fn load_ai_chat_thread(
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
pub(super) fn start_ai_chat_thread(
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
pub(super) async fn send_ai_chat_message(
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
        match build_ai_chat_response(&app, &state, &mut thread, &environment, &provider_message)
            .await
        {
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
pub(super) async fn dataverse_ai_whoami(
    app: AppHandle,
    environment_id: String,
) -> Result<Value, String> {
    let environment = environment_by_id(&app, Some(&environment_id))?;
    dataverse_ai_whoami_value(&app, &environment).await
}

#[tauri::command]
pub(super) async fn dataverse_ai_list_entity_sets(
    app: AppHandle,
    environment_id: String,
    search: Option<String>,
) -> Result<Value, String> {
    let environment = environment_by_id(&app, Some(&environment_id))?;
    dataverse_ai_list_entity_sets_value(&app, &environment, search).await
}

#[tauri::command]
pub(super) async fn dataverse_ai_metadata(
    app: AppHandle,
    environment_id: String,
    logical_name: Option<String>,
) -> Result<Value, String> {
    let environment = environment_by_id(&app, Some(&environment_id))?;
    dataverse_ai_metadata_value(&app, &environment, logical_name).await
}

#[tauri::command]
pub(super) async fn dataverse_ai_get(
    app: AppHandle,
    environment_id: String,
    path: String,
) -> Result<Value, String> {
    let environment = environment_by_id(&app, Some(&environment_id))?;
    dataverse_ai_get_value(&app, &environment, &path)
        .await
        .map(|(value, _)| value)
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
