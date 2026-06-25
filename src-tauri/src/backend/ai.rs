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
pub(super) struct AiChatAttachment {
    id: String,
    kind: String,
    path: String,
    name: String,
    status: String,
    context_included: bool,
    image_included: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    item_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AiChatAttachmentBundle {
    attachments: Vec<AiChatAttachment>,
    context: String,
    image_paths: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AiChatContextUsage {
    #[serde(default)]
    provider: String,
    #[serde(default)]
    model: String,
    used_tokens: u64,
    input_tokens: u64,
    cached_input_tokens: u64,
    output_tokens: u64,
    reasoning_output_tokens: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    context_window_tokens: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    percent_full: Option<f64>,
    #[serde(default)]
    auto_compaction_enabled: bool,
    #[serde(default)]
    manual_compaction_available: bool,
    #[serde(default)]
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PastedAiChatImageInput {
    name: Option<String>,
    mime_type: String,
    data_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PastedAiChatImage {
    path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AiChatThread {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    environment_id: Option<String>,
    #[serde(default = "default_ai_chat_mode")]
    mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    provider_thread_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    codex_thread_id: Option<String>,
    provider: String,
    model: String,
    reasoning_effort: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    context_usage: Option<AiChatContextUsage>,
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
    mode: String,
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
    sidecar: AsyncMutex<Option<AiSidecarProcess>>,
}

#[derive(Debug)]
pub(super) struct AiGetRequest {
    path: String,
    query: Vec<(String, String)>,
}

#[derive(Debug)]
pub(super) struct AiMutationRequest {
    method: reqwest::Method,
    method_label: String,
    path: String,
    payload: Option<Value>,
}

pub(super) struct AiSidecarProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: Lines<BufReader<ChildStdout>>,
    stderr_tail: Arc<Mutex<VecDeque<String>>>,
}

impl Drop for AiSidecarProcess {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
    }
}

const AI_MODEL_CATALOG_JSON: &str = include_str!("../../../src/core/ai/model-catalog.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiModelCatalog {
    default_provider: String,
    providers: Vec<AiProviderCatalog>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiProviderCatalog {
    id: String,
    default_model: String,
    default_reasoning_effort: String,
    models: Vec<AiCatalogOption>,
    #[serde(default)]
    legacy_models: Vec<String>,
    reasoning_efforts: Vec<AiCatalogOption>,
    #[serde(default)]
    legacy_reasoning_efforts: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct AiCatalogOption {
    value: String,
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
    #[serde(default)]
    context_usage: Option<AiChatContextUsage>,
}

impl AiProviderTurnResult {
    fn provider_session_id(&self) -> Option<String> {
        self.provider_thread_id
            .clone()
            .or(self.codex_thread_id.clone())
    }
}

fn normalize_ai_context_usage(
    provider: &str,
    model: &str,
    mut usage: AiChatContextUsage,
) -> Result<AiChatContextUsage, String> {
    usage.provider = provider.to_string();
    usage.model = model.to_string();
    usage.updated_at = now_rfc3339()?;

    if usage.used_tokens == 0 {
        usage.used_tokens = usage.input_tokens;
    }

    if let Some(context_window_tokens) = usage.context_window_tokens.filter(|value| *value > 0) {
        let percent = (usage.used_tokens as f64 / context_window_tokens as f64) * 100.0;
        usage.percent_full = Some(percent.clamp(0.0, 100.0));
    }

    Ok(usage)
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
        mode: thread.mode.clone(),
        provider: thread.provider.clone(),
        model: thread.model.clone(),
        reasoning_effort: thread.reasoning_effort.clone(),
        title: thread.title.clone(),
        created_at: thread.created_at.clone(),
        updated_at: thread.updated_at.clone(),
        message_count: thread.messages.len(),
    })
}

pub(super) fn default_ai_chat_mode() -> String {
    "chat".to_string()
}

fn ai_model_catalog() -> Result<AiModelCatalog, String> {
    serde_json::from_str(AI_MODEL_CATALOG_JSON)
        .map_err(|error| format!("AI model catalog is invalid: {error}"))
}

fn ai_provider_catalog<'a>(
    catalog: &'a AiModelCatalog,
    provider: &str,
) -> Option<&'a AiProviderCatalog> {
    catalog.providers.iter().find(|item| item.id == provider)
}

fn ai_catalog_contains(options: &[AiCatalogOption], value: &str) -> bool {
    options.iter().any(|option| option.value == value)
}

fn ai_catalog_contains_legacy(options: &[String], value: &str) -> bool {
    options.iter().any(|option| option == value)
}

pub(super) fn normalize_ai_chat_mode(mode: Option<&str>) -> Result<String, String> {
    let mode = mode
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("chat");

    match mode {
        "chat" | "experimental-agent" => Ok(mode.to_string()),
        _ => Err(format!("Unsupported AI chat mode: {mode}")),
    }
}

pub(super) fn normalize_ai_provider(provider: Option<&str>) -> Result<String, String> {
    let catalog = ai_model_catalog()?;
    let provider = provider
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&catalog.default_provider);

    if let Some(provider) = ai_provider_catalog(&catalog, provider) {
        Ok(provider.id.clone())
    } else {
        Err(format!("Unsupported AI provider: {provider}"))
    }
}

pub(super) fn normalize_ai_model(provider: &str, model: Option<&str>) -> Result<String, String> {
    let catalog = ai_model_catalog()?;
    let provider_catalog = ai_provider_catalog(&catalog, provider)
        .ok_or_else(|| format!("Unsupported AI provider: {provider}"))?;
    let model = model
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&provider_catalog.default_model);

    if ai_catalog_contains(&provider_catalog.models, model)
        || ai_catalog_contains_legacy(&provider_catalog.legacy_models, model)
    {
        Ok(model.to_string())
    } else {
        Err(format!("Unsupported {provider} model: {model}"))
    }
}

pub(super) fn normalize_ai_reasoning_effort(
    provider: &str,
    reasoning_effort: Option<&str>,
) -> Result<String, String> {
    let catalog = ai_model_catalog()?;
    let provider_catalog = ai_provider_catalog(&catalog, provider)
        .ok_or_else(|| format!("Unsupported AI provider: {provider}"))?;
    let reasoning_effort = reasoning_effort
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&provider_catalog.default_reasoning_effort);

    if ai_catalog_contains(&provider_catalog.reasoning_efforts, reasoning_effort)
        || ai_catalog_contains_legacy(&provider_catalog.legacy_reasoning_efforts, reasoning_effort)
    {
        Ok(reasoning_effort.to_string())
    } else {
        Err(format!(
            "Unsupported {provider} reasoning effort: {reasoning_effort}"
        ))
    }
}

pub(super) fn create_ai_chat_thread(
    environment_id: Option<String>,
    mode: Option<&str>,
    provider: Option<&str>,
    model: Option<&str>,
    reasoning_effort: Option<&str>,
    provider_thread_id: Option<String>,
) -> Result<AiChatThread, String> {
    let now = now_rfc3339()?;
    let mode = normalize_ai_chat_mode(mode)?;
    let provider = normalize_ai_provider(provider)?;
    let model = normalize_ai_model(&provider, model)?;
    let reasoning_effort = normalize_ai_reasoning_effort(&provider, reasoning_effort)?;

    Ok(AiChatThread {
        id: format!("ai-thread-{}", Uuid::new_v4()),
        environment_id,
        mode,
        provider_thread_id: provider_thread_id.clone(),
        codex_thread_id: if provider == "codex" {
            provider_thread_id
        } else {
            None
        },
        provider,
        model,
        reasoning_effort,
        context_usage: None,
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

pub(super) fn normalize_manual_ai_chat_title(title: &str) -> Result<String, String> {
    let normalized = title
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string();

    if normalized.is_empty() {
        return Err("Chat title is required.".to_string());
    }

    let mut title = normalized.chars().take(120).collect::<String>();
    if normalized.chars().count() > 120 {
        title.push_str("...");
    }

    Ok(title)
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

fn ai_attachment_path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn ai_attachment_name(path: &Path) -> String {
    path.file_name()
        .map(|value| value.to_string_lossy().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| ai_attachment_path_string(path))
}

fn ai_attachment_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
}

fn ai_attachment_mime_type(path: &Path) -> Option<&'static str> {
    match ai_attachment_extension(path).as_deref() {
        Some("png") => Some("image/png"),
        Some("jpg") | Some("jpeg") => Some("image/jpeg"),
        Some("gif") => Some("image/gif"),
        Some("webp") => Some("image/webp"),
        Some("md") | Some("markdown") => Some("text/markdown"),
        Some("txt") | Some("log") => Some("text/plain"),
        Some("json") => Some("application/json"),
        Some("xml") | Some("xaml") | Some("resx") | Some("csproj") => Some("application/xml"),
        Some("html") | Some("htm") => Some("text/html"),
        Some("css") => Some("text/css"),
        Some("csv") => Some("text/csv"),
        Some("js") | Some("jsx") | Some("mjs") | Some("cjs") => Some("text/javascript"),
        Some("ts") | Some("tsx") | Some("mts") | Some("cts") => Some("text/typescript"),
        Some("rs") => Some("text/rust"),
        Some("cs") => Some("text/csharp"),
        Some("yml") | Some("yaml") => Some("application/yaml"),
        Some("toml") => Some("application/toml"),
        Some("sql") => Some("application/sql"),
        Some("sh") | Some("bash") | Some("zsh") | Some("ps1") => Some("text/x-shellscript"),
        _ => None,
    }
}

fn ai_attachment_is_image(path: &Path) -> bool {
    matches!(
        ai_attachment_extension(path).as_deref(),
        Some("png" | "jpg" | "jpeg" | "gif" | "webp")
    )
}

fn pasted_ai_chat_image_extension(mime_type: &str) -> Option<&'static str> {
    let normalized = mime_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();

    match normalized.as_str() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        _ => None,
    }
}

fn decode_pasted_ai_chat_image(
    input: &PastedAiChatImageInput,
) -> Result<(Vec<u8>, &'static str), String> {
    let extension = pasted_ai_chat_image_extension(&input.mime_type)
        .ok_or_else(|| "Only PNG, JPEG, GIF, and WebP images can be pasted.".to_string())?;
    let data_base64 = input.data_base64.trim();
    let max_encoded_len = ((AI_PASTED_IMAGE_MAX_BYTES + 2) / 3) * 4 + 16;

    if data_base64.len() > max_encoded_len {
        return Err(format!(
            "Pasted image is larger than {} bytes.",
            AI_PASTED_IMAGE_MAX_BYTES
        ));
    }

    let bytes = BASE64
        .decode(data_base64)
        .map_err(|_| "Pasted image data was not valid base64.".to_string())?;

    if bytes.is_empty() {
        return Err("Pasted image was empty.".to_string());
    }

    if bytes.len() > AI_PASTED_IMAGE_MAX_BYTES {
        return Err(format!(
            "Pasted image is larger than {} bytes.",
            AI_PASTED_IMAGE_MAX_BYTES
        ));
    }

    Ok((bytes, extension))
}

fn pasted_ai_chat_image_stem(name: Option<&str>) -> String {
    let raw_stem = name
        .and_then(|value| Path::new(value).file_stem())
        .and_then(|value| value.to_str())
        .unwrap_or("pasted-image");
    let mut stem = String::new();

    for character in raw_stem.chars() {
        if stem.len() >= 48 {
            break;
        }

        if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
            stem.push(character);
        } else if !stem.ends_with('-') {
            stem.push('-');
        }
    }

    let stem = stem.trim_matches('-');
    if stem.is_empty() {
        "pasted-image".to_string()
    } else {
        stem.to_string()
    }
}

fn pasted_ai_chat_image_path(
    app: &AppHandle,
    name: Option<&str>,
    extension: &str,
) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join(AI_PASTED_IMAGES_DIR_NAME);
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();

    Ok(directory.join(format!(
        "{}-{timestamp}-{}.{}",
        pasted_ai_chat_image_stem(name),
        Uuid::new_v4(),
        extension
    )))
}

fn ai_attachment_is_text_candidate(path: &Path) -> bool {
    matches!(
        ai_attachment_extension(path).as_deref(),
        Some(
            "bash"
                | "c"
                | "cmd"
                | "cs"
                | "csproj"
                | "css"
                | "csv"
                | "cts"
                | "env"
                | "fs"
                | "fsx"
                | "go"
                | "graphql"
                | "htm"
                | "html"
                | "java"
                | "js"
                | "json"
                | "jsx"
                | "log"
                | "md"
                | "markdown"
                | "mjs"
                | "mts"
                | "php"
                | "ps1"
                | "py"
                | "rb"
                | "resx"
                | "rs"
                | "scss"
                | "sh"
                | "sql"
                | "svg"
                | "toml"
                | "ts"
                | "tsx"
                | "txt"
                | "vue"
                | "xaml"
                | "xml"
                | "yaml"
                | "yml"
                | "zsh"
        )
    )
}

fn ai_attachment_should_skip_dir(path: &Path) -> bool {
    matches!(
        path.file_name().and_then(|value| value.to_str()),
        Some(
            ".git"
                | ".hg"
                | ".svn"
                | ".next"
                | ".turbo"
                | "bin"
                | "build"
                | "dist"
                | "node_modules"
                | "obj"
                | "target"
        )
    )
}

fn ai_attachment_should_skip_file(path: &Path) -> bool {
    matches!(
        path.file_name().and_then(|value| value.to_str()),
        Some(".DS_Store" | "Thumbs.db")
    )
}

fn truncate_ai_context(value: &str, max_chars: usize) -> (String, bool) {
    let mut output = String::new();
    let mut truncated = false;

    for (index, character) in value.chars().enumerate() {
        if index >= max_chars {
            truncated = true;
            break;
        }

        output.push(character);
    }

    (output, truncated)
}

fn append_ai_attachment_context(
    context: &mut String,
    warnings: &mut Vec<String>,
    title: &str,
    body: &str,
) -> bool {
    let used = context.chars().count();
    if used >= AI_ATTACHMENT_MAX_TOTAL_CONTEXT_CHARS {
        warnings.push(format!(
            "Skipped {title} because the attachment context budget is full."
        ));
        return false;
    }

    let remaining = AI_ATTACHMENT_MAX_TOTAL_CONTEXT_CHARS - used;
    let section = format!("## {title}\n{body}");
    let (section, truncated) = truncate_ai_context(&section, remaining);

    if !context.is_empty() {
        context.push_str("\n\n");
    }
    context.push_str(&section);

    if truncated {
        warnings.push(format!(
            "Truncated {title} because the attachment context budget is full."
        ));
    }

    true
}

fn read_ai_text_attachment(path: &Path) -> Result<(String, bool), String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.len() > AI_ATTACHMENT_MAX_TEXT_FILE_BYTES {
        return Err(format!(
            "File is larger than {} bytes.",
            AI_ATTACHMENT_MAX_TEXT_FILE_BYTES
        ));
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let (content, truncated) = truncate_ai_context(&content, AI_ATTACHMENT_MAX_TEXT_CHARS_PER_FILE);

    Ok((content, truncated))
}

fn ai_context_fence_for_path(path: &Path) -> &str {
    match ai_attachment_extension(path).as_deref() {
        Some("js" | "jsx" | "mjs" | "cjs") => "javascript",
        Some("ts" | "tsx" | "mts" | "cts") => "typescript",
        Some("md" | "markdown") => "markdown",
        Some("yml" | "yaml") => "yaml",
        Some("rs") => "rust",
        Some("cs") => "csharp",
        Some("py") => "python",
        Some("sh" | "bash" | "zsh") => "bash",
        Some("ps1") => "powershell",
        Some("html" | "htm") => "html",
        Some("css" | "scss") => "css",
        Some("xml" | "xaml" | "resx" | "csproj") => "xml",
        Some("json") => "json",
        Some("sql") => "sql",
        _ => "text",
    }
}

fn relative_ai_attachment_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string()
}

fn append_ai_text_file_context(
    context: &mut String,
    warnings: &mut Vec<String>,
    path: &Path,
    display_path: &str,
) -> (bool, Option<String>) {
    if !ai_attachment_is_text_candidate(path) {
        return (
            false,
            Some("File type is summarized but not read as text.".to_string()),
        );
    }

    let (content, truncated_file) = match read_ai_text_attachment(path) {
        Ok(value) => value,
        Err(error) => return (false, Some(format!("Could not read text content: {error}"))),
    };
    let fence = ai_context_fence_for_path(path);
    let body = format!(
        "Path: {}\nMIME type: {}\n\n```{}\n{}\n```{}",
        ai_attachment_path_string(path),
        ai_attachment_mime_type(path).unwrap_or("text/plain"),
        fence,
        content,
        if truncated_file {
            "\n\n_File content was truncated._"
        } else {
            ""
        }
    );
    let included =
        append_ai_attachment_context(context, warnings, &format!("File: {display_path}"), &body);
    let reason = if truncated_file {
        Some("Included text content with per-file truncation.".to_string())
    } else {
        None
    };

    (included, reason)
}

fn append_ai_file_summary_context(
    context: &mut String,
    warnings: &mut Vec<String>,
    title: &str,
    path: &Path,
    metadata: Option<&fs::Metadata>,
    note: &str,
) -> bool {
    let body = format!(
        "Path: {}\nMIME type: {}\nSize: {}\n{}",
        ai_attachment_path_string(path),
        ai_attachment_mime_type(path).unwrap_or("unknown"),
        metadata
            .map(|value| format!("{} bytes", value.len()))
            .unwrap_or_else(|| "unknown".to_string()),
        note
    );

    append_ai_attachment_context(context, warnings, title, &body)
}

fn collect_ai_folder_files(root: &Path, warnings: &mut Vec<String>) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let mut stack = vec![root.to_path_buf()];

    while let Some(directory) = stack.pop() {
        let mut entries = match fs::read_dir(&directory) {
            Ok(entries) => entries.filter_map(Result::ok).collect::<Vec<_>>(),
            Err(error) => {
                warnings.push(format!(
                    "Could not read folder {}: {error}",
                    directory.display()
                ));
                continue;
            }
        };
        entries.sort_by_key(|entry| entry.path());

        for entry in entries {
            let path = entry.path();
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(error) => {
                    warnings.push(format!("Could not inspect {}: {error}", path.display()));
                    continue;
                }
            };

            if file_type.is_dir() {
                if !ai_attachment_should_skip_dir(&path) {
                    stack.push(path);
                }
                continue;
            }

            if !file_type.is_file() || ai_attachment_should_skip_file(&path) {
                continue;
            }

            if files.len() >= AI_ATTACHMENT_MAX_FOLDER_FILES {
                warnings.push(format!(
                    "Stopped scanning {} after {} files.",
                    root.display(),
                    AI_ATTACHMENT_MAX_FOLDER_FILES
                ));
                return files;
            }

            files.push(path);
        }
    }

    files.sort();
    files
}

fn prepare_ai_file_attachment(
    path: &Path,
    context: &mut String,
    image_paths: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> AiChatAttachment {
    let metadata = fs::metadata(path);
    let size_bytes = metadata.as_ref().ok().map(fs::Metadata::len);
    let name = ai_attachment_name(path);
    let path_string = ai_attachment_path_string(path);
    let mime_type = ai_attachment_mime_type(path).map(ToString::to_string);

    if !metadata
        .as_ref()
        .map(|value| value.is_file())
        .unwrap_or(false)
    {
        return AiChatAttachment {
            id: format!("ai-attachment-{}", Uuid::new_v4()),
            kind: "file".to_string(),
            path: path_string,
            name,
            status: "skipped".to_string(),
            context_included: false,
            image_included: false,
            size_bytes,
            mime_type,
            item_count: None,
            reason: Some("Path is not a readable file.".to_string()),
        };
    }

    if ai_attachment_is_image(path) {
        let image_included = image_paths.len() < AI_ATTACHMENT_MAX_CODEX_IMAGES;
        if image_included {
            image_paths.push(path_string.clone());
        }
        let context_included = append_ai_file_summary_context(
            context,
            warnings,
            &format!("Image: {name}"),
            path,
            metadata.as_ref().ok(),
            if image_included {
                "Image pixels are attached to Codex as a local image for this turn. Claude receives this metadata only."
            } else {
                "Image metadata is included, but the Codex local-image limit for this turn was reached."
            },
        );

        return AiChatAttachment {
            id: format!("ai-attachment-{}", Uuid::new_v4()),
            kind: "image".to_string(),
            path: path_string,
            name,
            status: if image_included {
                "included"
            } else {
                "summarized"
            }
            .to_string(),
            context_included,
            image_included,
            size_bytes,
            mime_type,
            item_count: None,
            reason: if image_included {
                Some("Image pixels are available to Codex for this turn.".to_string())
            } else {
                Some("Codex image limit reached; image was summarized only.".to_string())
            },
        };
    }

    let (context_included, reason) = append_ai_text_file_context(context, warnings, path, &name);

    if context_included {
        return AiChatAttachment {
            id: format!("ai-attachment-{}", Uuid::new_v4()),
            kind: "file".to_string(),
            path: path_string,
            name,
            status: "included".to_string(),
            context_included,
            image_included: false,
            size_bytes,
            mime_type,
            item_count: None,
            reason,
        };
    }

    let summary_included = append_ai_file_summary_context(
        context,
        warnings,
        &format!("File: {name}"),
        path,
        metadata.as_ref().ok(),
        reason
            .as_deref()
            .unwrap_or("File content was summarized but not read."),
    );

    AiChatAttachment {
        id: format!("ai-attachment-{}", Uuid::new_v4()),
        kind: "file".to_string(),
        path: path_string,
        name,
        status: if summary_included {
            "summarized"
        } else {
            "skipped"
        }
        .to_string(),
        context_included: summary_included,
        image_included: false,
        size_bytes,
        mime_type,
        item_count: None,
        reason,
    }
}

fn prepare_ai_folder_attachment(
    path: &Path,
    context: &mut String,
    warnings: &mut Vec<String>,
) -> AiChatAttachment {
    let path_string = ai_attachment_path_string(path);
    let name = ai_attachment_name(path);
    let mut folder_warnings = Vec::new();
    let files = collect_ai_folder_files(path, &mut folder_warnings);
    warnings.extend(folder_warnings);

    if files.is_empty() {
        let context_included = append_ai_attachment_context(
            context,
            warnings,
            &format!("Folder: {name}"),
            &format!("Path: {path_string}\nNo readable files were found."),
        );

        return AiChatAttachment {
            id: format!("ai-attachment-{}", Uuid::new_v4()),
            kind: "folder".to_string(),
            path: path_string,
            name,
            status: if context_included {
                "summarized"
            } else {
                "skipped"
            }
            .to_string(),
            context_included,
            image_included: false,
            size_bytes: None,
            mime_type: None,
            item_count: Some(0),
            reason: Some("No readable files were found in the selected folder.".to_string()),
        };
    }

    let mut included_files = 0usize;
    let mut summarized_files = 0usize;
    let mut skipped_files = 0usize;

    for file in &files {
        let relative_path = relative_ai_attachment_path(path, file);
        let (included, reason) =
            append_ai_text_file_context(context, warnings, file, &relative_path);

        if included {
            included_files += 1;
        } else if append_ai_file_summary_context(
            context,
            warnings,
            &format!("Folder file: {relative_path}"),
            file,
            fs::metadata(file).ok().as_ref(),
            reason
                .as_deref()
                .unwrap_or("Folder file was summarized but not read."),
        ) {
            summarized_files += 1;
        } else {
            skipped_files += 1;
        }
    }

    let folder_summary = format!(
        "Path: {path_string}\nFiles scanned: {}\nText files included: {included_files}\nFiles summarized: {summarized_files}\nFiles skipped because of context budget: {skipped_files}",
        files.len()
    );
    let summary_included = append_ai_attachment_context(
        context,
        warnings,
        &format!("Folder summary: {name}"),
        &folder_summary,
    );

    AiChatAttachment {
        id: format!("ai-attachment-{}", Uuid::new_v4()),
        kind: "folder".to_string(),
        path: path_string,
        name,
        status: if included_files > 0 {
            "included"
        } else if summary_included || summarized_files > 0 {
            "summarized"
        } else {
            "skipped"
        }
        .to_string(),
        context_included: included_files > 0 || summary_included || summarized_files > 0,
        image_included: false,
        size_bytes: None,
        mime_type: None,
        item_count: Some(files.len()),
        reason: Some(format!(
            "{included_files} text files included, {summarized_files} files summarized."
        )),
    }
}

pub(super) fn prepare_ai_chat_attachments_for_paths(
    paths: Vec<String>,
) -> Result<AiChatAttachmentBundle, String> {
    let mut seen = HashSet::new();
    let mut selected_paths = Vec::new();
    let mut warnings = Vec::new();

    for path in paths {
        let trimmed = path.trim();
        if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
            continue;
        }

        if selected_paths.len() >= AI_ATTACHMENT_MAX_SELECTED_PATHS {
            warnings.push(format!(
                "Only the first {} selected paths were attached.",
                AI_ATTACHMENT_MAX_SELECTED_PATHS
            ));
            break;
        }

        selected_paths.push(PathBuf::from(trimmed));
    }

    let mut context = String::new();
    let mut attachments = Vec::new();
    let mut image_paths = Vec::new();

    for path in selected_paths {
        let metadata = match fs::metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) => {
                attachments.push(AiChatAttachment {
                    id: format!("ai-attachment-{}", Uuid::new_v4()),
                    kind: "file".to_string(),
                    path: ai_attachment_path_string(&path),
                    name: ai_attachment_name(&path),
                    status: "skipped".to_string(),
                    context_included: false,
                    image_included: false,
                    size_bytes: None,
                    mime_type: ai_attachment_mime_type(&path).map(ToString::to_string),
                    item_count: None,
                    reason: Some(format!("Could not read path: {error}")),
                });
                continue;
            }
        };

        if metadata.is_dir() {
            attachments.push(prepare_ai_folder_attachment(
                &path,
                &mut context,
                &mut warnings,
            ));
        } else if metadata.is_file() {
            attachments.push(prepare_ai_file_attachment(
                &path,
                &mut context,
                &mut image_paths,
                &mut warnings,
            ));
        } else {
            attachments.push(AiChatAttachment {
                id: format!("ai-attachment-{}", Uuid::new_v4()),
                kind: "file".to_string(),
                path: ai_attachment_path_string(&path),
                name: ai_attachment_name(&path),
                status: "skipped".to_string(),
                context_included: false,
                image_included: false,
                size_bytes: None,
                mime_type: ai_attachment_mime_type(&path).map(ToString::to_string),
                item_count: None,
                reason: Some("Path is neither a file nor a folder.".to_string()),
            });
        }
    }

    if !context.is_empty() {
        context = format!(
            "The user attached local context for this turn. Use it only for this answer and do not claim access to paths or files that were skipped.\n\n{context}"
        );
    }

    Ok(AiChatAttachmentBundle {
        attachments,
        context,
        image_paths,
        warnings,
    })
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

fn non_empty_os_str(value: &std::ffi::OsStr) -> bool {
    !value.to_string_lossy().trim().is_empty()
}

fn node_executable_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    }
}

fn path_node_candidate(directory: PathBuf) -> PathBuf {
    directory.join(node_executable_name())
}

fn existing_file(path: PathBuf) -> Option<PathBuf> {
    path.is_file().then_some(path)
}

fn node_from_path(path_env: Option<&std::ffi::OsStr>) -> Option<PathBuf> {
    let path_env = path_env.filter(|value| non_empty_os_str(value))?;

    env::split_paths(path_env).find_map(|directory| existing_file(path_node_candidate(directory)))
}

fn nvm_node_candidates(home_dir: &Path) -> Vec<PathBuf> {
    let versions_dir = home_dir.join(".nvm/versions/node");
    let Ok(entries) = fs::read_dir(versions_dir) else {
        return Vec::new();
    };

    let mut candidates = entries
        .filter_map(Result::ok)
        .map(|entry| path_node_candidate(entry.path().join("bin")))
        .filter(|path| path.is_file())
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| right.cmp(left));
    candidates
}

fn common_node_candidates(home_dir: &Path) -> Vec<PathBuf> {
    let mut candidates = vec![
        path_node_candidate(home_dir.join(".local/bin")),
        path_node_candidate(home_dir.join(".local/share/mise/shims")),
        path_node_candidate(home_dir.join(".local/share/mise/installs/node/latest/bin")),
        path_node_candidate(home_dir.join(".local/share/mise/installs/node/lts/bin")),
        path_node_candidate(home_dir.join(".mise/shims")),
        path_node_candidate(home_dir.join(".asdf/shims")),
        path_node_candidate(home_dir.join(".volta/bin")),
        PathBuf::from("/opt/homebrew/bin/node"),
        PathBuf::from("/usr/local/bin/node"),
        PathBuf::from("/usr/bin/node"),
    ];
    candidates.extend(nvm_node_candidates(home_dir));
    candidates
}

pub(super) fn ai_node_command_for(
    home_dir: &Path,
    path_env: Option<&std::ffi::OsStr>,
    configured: Option<&std::ffi::OsStr>,
) -> PathBuf {
    if let Some(configured) = configured.filter(|value| non_empty_os_str(value)) {
        return PathBuf::from(configured);
    }

    if let Some(path_node) = node_from_path(path_env) {
        return path_node;
    }

    common_node_candidates(home_dir)
        .into_iter()
        .find_map(existing_file)
        .unwrap_or_else(|| PathBuf::from(node_executable_name()))
}

pub(super) fn ai_node_command(home_dir: &Path) -> PathBuf {
    ai_node_command_for(
        home_dir,
        env::var_os("PATH").as_deref(),
        env::var_os("OPENDATAVERSE_AI_NODE").as_deref(),
    )
}

fn ai_sidecar_path_env(home_dir: &Path) -> std::ffi::OsString {
    let mut paths = vec![
        home_dir.join(".local/bin"),
        home_dir.join(".local/share/mise/shims"),
        home_dir.join(".local/share/mise/installs/node/latest/bin"),
        home_dir.join(".local/share/mise/installs/node/lts/bin"),
        home_dir.join(".mise/shims"),
        home_dir.join(".asdf/shims"),
        home_dir.join(".volta/bin"),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
        PathBuf::from("/usr/sbin"),
        PathBuf::from("/sbin"),
    ];

    if let Some(existing_path) = env::var_os("PATH").filter(|value| non_empty_os_str(value)) {
        paths.extend(env::split_paths(&existing_path));
    }

    env::join_paths(paths).unwrap_or_else(|_| {
        env::var_os("PATH").unwrap_or_else(|| std::ffi::OsString::from("/usr/bin:/bin"))
    })
}

pub(super) fn spawn_ai_sidecar(app: &AppHandle) -> Result<AiSidecarProcess, String> {
    let script_path = ai_sidecar_script_path(app)?;
    let home_dir = app.path().home_dir().map_err(|error| error.to_string())?;
    let codex_home = env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home_dir.join(".codex"));
    let node_command = ai_node_command(&home_dir);
    let mut command = Command::new(&node_command);
    command
        .arg(&script_path)
        .env("HOME", &home_dir)
        .env("CODEX_HOME", &codex_home)
        .env("PATH", ai_sidecar_path_env(&home_dir))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command.spawn().map_err(|error| {
        format!(
            "Could not start AI sidecar with Node at {}. Install Node or set OPENDATAVERSE_AI_NODE. {error}",
            node_command.display()
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
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "AI sidecar stderr was not available.".to_string())?;
    let stderr_tail = Arc::new(Mutex::new(VecDeque::new()));
    spawn_ai_sidecar_stderr_reader(stderr, Arc::clone(&stderr_tail));

    Ok(AiSidecarProcess {
        child,
        stdin,
        stdout: BufReader::new(stdout).lines(),
        stderr_tail,
    })
}

fn push_ai_sidecar_stderr_tail(tail: &Arc<Mutex<VecDeque<String>>>, line: String) {
    let Ok(mut lines) = tail.lock() else {
        return;
    };

    if lines.len() >= AI_SIDECAR_STDERR_LINES {
        lines.pop_front();
    }
    lines.push_back(line);
}

fn spawn_ai_sidecar_stderr_reader(stderr: ChildStderr, tail: Arc<Mutex<VecDeque<String>>>) {
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();

        loop {
            match lines.next_line().await {
                Ok(Some(line)) => push_ai_sidecar_stderr_tail(&tail, line),
                Ok(None) => break,
                Err(error) => {
                    push_ai_sidecar_stderr_tail(
                        &tail,
                        format!("Could not read AI sidecar stderr: {error}"),
                    );
                    break;
                }
            }
        }
    });
}

fn ai_sidecar_stderr_tail(tail: &Arc<Mutex<VecDeque<String>>>) -> String {
    let Ok(lines) = tail.lock() else {
        return String::new();
    };

    let lines = lines
        .iter()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();

    if lines.is_empty() {
        String::new()
    } else {
        format!(" Recent sidecar stderr: {}", lines.join(" | "))
    }
}

fn ai_sidecar_timeout_error(tail: &Arc<Mutex<VecDeque<String>>>) -> String {
    format!(
        "AI sidecar timed out after {} seconds.{}",
        AI_SIDECAR_RESPONSE_TIMEOUT.as_secs(),
        ai_sidecar_stderr_tail(tail)
    )
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

pub(super) async fn run_ai_sidecar_stream_request(
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
    let mut sidecar_slot = state.sidecar.lock().await;
    let mut reset_sidecar = false;
    let request_result = {
        let process = ensure_ai_sidecar(app, &mut sidecar_slot)?;
        let request_line = format!("{request}\n");
        let send_result = async {
            process.stdin.write_all(request_line.as_bytes()).await?;
            process.stdin.flush().await
        }
        .await;

        if let Err(error) = send_result {
            reset_sidecar = true;
            Err(format!("Could not send request to AI sidecar: {error}"))
        } else {
            let response = tokio::time::timeout(AI_SIDECAR_RESPONSE_TIMEOUT, async {
                loop {
                    let Some(line) = process.stdout.next_line().await.map_err(|error| {
                        (format!("Could not read AI sidecar response: {error}"), true)
                    })?
                    else {
                        return Err((
                            "AI sidecar stopped before returning a response.".to_string(),
                            true,
                        ));
                    };

                    let response: AiSidecarResponse =
                        serde_json::from_str(line.trim()).map_err(|error| {
                            (
                                format!(
                                    "AI sidecar returned invalid JSON: {error}. Response: {}",
                                    line.trim()
                                ),
                                false,
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

                    return Err((
                        response
                            .error
                            .unwrap_or_else(|| "AI sidecar request failed.".to_string()),
                        false,
                    ));
                }
            })
            .await;

            match response {
                Ok(result) => result.map_err(|(message, should_reset)| {
                    reset_sidecar = should_reset;
                    message
                }),
                Err(_) => {
                    reset_sidecar = true;
                    let timeout_error = ai_sidecar_timeout_error(&process.stderr_tail);
                    let _ = process.child.start_kill();
                    Err(timeout_error)
                }
            }
        }
    };

    if reset_sidecar {
        *sidecar_slot = None;
    }

    request_result
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

pub(super) fn normalize_ai_mutation_path(input: &str) -> Result<String, String> {
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

pub(super) fn normalize_ai_mutation_request(
    arguments: &Value,
) -> Result<AiMutationRequest, String> {
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

pub(super) fn mutation_display_from_arguments(arguments: &Value) -> Option<String> {
    let method = ai_tool_argument(arguments, "method")?.to_uppercase();
    let path = ai_tool_argument(arguments, "path")?;
    Some(format!("{method} {path}"))
}

pub(super) async fn dataverse_ai_mutate_value(
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

pub(super) fn ai_tool_argument(arguments: &Value, name: &str) -> Option<String> {
    arguments
        .get(name)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

pub(super) async fn run_ai_provider_turn(
    app: &AppHandle,
    state: &State<'_, AiChatState>,
    thread: &AiChatThread,
    environment: &DataverseEnvironment,
    message: &str,
    tool_results: Vec<Value>,
    image_paths: Vec<String>,
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
          "mode": thread.mode,
          "providerThreadId": provider_thread_id,
          "codexThreadId": thread.codex_thread_id,
          "environmentId": environment.id,
          "message": message,
          "model": thread.model,
          "reasoningEffort": thread.reasoning_effort,
          "toolResults": tool_results,
          "imagePaths": image_paths,
        }),
        |_event| {},
    )
    .await
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
                (
                    fallback_display.clone(),
                    value.map(|(value, display)| (value, display)),
                )
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
    image_paths: &[String],
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
            if completed_tool_rounds == 0 {
                image_paths.to_vec()
            } else {
                Vec::new()
            },
        )
        .await?;
        update_ai_thread_provider_thread_id(thread, turn.provider_session_id());
        let context_usage = turn
            .context_usage
            .map(|usage| normalize_ai_context_usage(&thread.provider, &thread.model, usage))
            .transpose()?;
        if let Some(context_usage) = context_usage.clone() {
            thread.context_usage = Some(context_usage);
        }
        let mut provider_turn_message = mark_ai_message_status(&provider_turn_message, "complete");
        provider_turn_message.metadata = Some(serde_json::json!({
          "provider": thread.provider,
          "providerThreadId": thread.provider_thread_id,
          "toolRequestCount": turn.tool_requests.len(),
          "toolResultCount": tool_results.len(),
          "toolRound": completed_tool_rounds,
          "model": thread.model,
          "reasoningEffort": thread.reasoning_effort,
          "contextUsage": context_usage,
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
        let allow_mutations = thread.mode == "experimental-agent";
        for request in turn.tool_requests.iter().take(AI_TOOL_REQUESTS_PER_ROUND) {
            let (tool_message, tool_result) =
                execute_ai_tool_request(app, &thread.id, environment, request, allow_mutations)
                    .await?;
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
pub(super) fn rename_ai_chat_thread(
    app: AppHandle,
    state: State<'_, AiChatState>,
    environment_id: String,
    thread_id: String,
    title: String,
) -> Result<AiChatThreadSummary, String> {
    let mut thread = load_ai_chat_thread_from_disk(&app, &environment_id, &thread_id)?
        .ok_or_else(|| "Saved AI chat was not found.".to_string())?;
    thread.title = normalize_manual_ai_chat_title(&title)?;
    save_ai_chat_thread(&app, &thread)?;

    state
        .threads
        .lock()
        .map_err(|error| error.to_string())?
        .insert(thread.id.clone(), thread.clone());

    summarize_ai_chat_thread(&thread).ok_or_else(|| "Saved AI chat was not found.".to_string())
}

#[tauri::command]
pub(super) fn delete_ai_chat_thread(
    app: AppHandle,
    state: State<'_, AiChatState>,
    environment_id: String,
    thread_id: String,
) -> Result<(), String> {
    let thread = load_ai_chat_thread_from_disk(&app, &environment_id, &thread_id)?
        .ok_or_else(|| "Saved AI chat was not found.".to_string())?;
    let path = ai_chat_thread_path(&app, &environment_id, &thread_id)?;

    match fs::remove_file(path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }

    state
        .threads
        .lock()
        .map_err(|error| error.to_string())?
        .remove(&thread.id);

    Ok(())
}

#[tauri::command]
pub(super) fn start_ai_chat_thread(
    state: State<'_, AiChatState>,
    environment_id: Option<String>,
    mode: Option<String>,
    provider: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
    provider_thread_id: Option<String>,
) -> Result<AiChatThread, String> {
    let thread = create_ai_chat_thread(
        environment_id,
        mode.as_deref(),
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
pub(super) fn prepare_ai_chat_attachments(
    paths: Vec<String>,
) -> Result<AiChatAttachmentBundle, String> {
    prepare_ai_chat_attachments_for_paths(paths)
}

#[tauri::command]
pub(super) fn save_pasted_ai_chat_image(
    app: AppHandle,
    input: PastedAiChatImageInput,
) -> Result<PastedAiChatImage, String> {
    let (bytes, extension) = decode_pasted_ai_chat_image(&input)?;
    let path = pasted_ai_chat_image_path(&app, input.name.as_deref(), extension)?;

    fs::write(&path, bytes).map_err(|error| error.to_string())?;

    Ok(PastedAiChatImage {
        path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub(super) async fn send_ai_chat_message(
    app: AppHandle,
    state: State<'_, AiChatState>,
    thread_id: String,
    environment_id: Option<String>,
    mode: Option<String>,
    message: String,
    context: Option<String>,
    attachments: Option<Vec<AiChatAttachment>>,
    image_paths: Option<Vec<String>>,
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
    let requested_mode = normalize_ai_chat_mode(mode.as_deref())?;
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
            Some(&requested_mode),
            Some(&requested_provider),
            Some(&model),
            Some(&reasoning_effort),
            provider_thread_id.clone(),
        )?;
        thread.id = thread_id.clone();
        thread
    };

    if !thread.messages.is_empty() && thread.mode != requested_mode {
        state
            .threads
            .lock()
            .map_err(|error| error.to_string())?
            .insert(thread.id.clone(), thread);
        return Err("This AI chat belongs to a different AI module. Clear the chat before switching modules.".to_string());
    }

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
    thread.mode = requested_mode.clone();
    if thread.messages.is_empty() && thread.provider != requested_provider {
        thread.provider_thread_id = None;
        thread.codex_thread_id = None;
    }
    thread.provider = requested_provider.clone();
    update_ai_thread_provider_thread_id(&mut thread, provider_thread_id);
    thread.model = model;
    thread.reasoning_effort = reasoning_effort;
    maybe_update_ai_chat_title(&mut thread, trimmed);
    let attachments = attachments.unwrap_or_default();
    let image_paths = image_paths.unwrap_or_default();
    let mut user_message = create_ai_message("user", trimmed, "complete")?;
    if !attachments.is_empty() {
        user_message.metadata = Some(serde_json::json!({
          "attachments": attachments,
          "attachmentContextChars": context.as_deref().map(str::len).unwrap_or(0),
          "imagePathCount": image_paths.len(),
        }));
    }
    thread.messages.push(user_message);
    let provider_context = if requested_provider == "claude" && !image_paths.is_empty() {
        let mut parts = Vec::new();
        if let Some(context) = context
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            parts.push(context.to_string());
        }
        parts.push(
            "Note: image pixels are only attached to Codex in this OpenDataverse version. Claude receives image file metadata from the attachment context, not the screenshot pixels."
                .to_string(),
        );
        Some(parts.join("\n\n"))
    } else {
        context
    };
    let provider_message = provider_context
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|context| format!("{context}\n\nUser question: {trimmed}"))
        .unwrap_or_else(|| trimmed.to_string());

    let response_messages = match build_ai_chat_response(
        &app,
        &state,
        &mut thread,
        &environment,
        &provider_message,
        &image_paths,
    )
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
    fn ai_model_catalog_drives_defaults_and_validation() {
        let provider = normalize_ai_provider(None).expect("default provider should normalize");

        assert_eq!(provider, "codex");
        assert_eq!(
            normalize_ai_model(&provider, None).expect("default model should normalize"),
            "gpt-5.4-mini"
        );
        assert_eq!(
            normalize_ai_reasoning_effort(&provider, None)
                .expect("default reasoning effort should normalize"),
            "medium"
        );
        assert!(normalize_ai_model(&provider, Some("not-a-model")).is_err());
        assert!(normalize_ai_provider(Some("not-a-provider")).is_err());
    }

    #[test]
    fn ai_model_catalog_keeps_legacy_claude_values_accepted() {
        assert_eq!(
            normalize_ai_model("claude", Some("claude-sonnet-4-5"))
                .expect("legacy Claude model should remain readable"),
            "claude-sonnet-4-5"
        );
        assert_eq!(
            normalize_ai_reasoning_effort("claude", Some("xhigh"))
                .expect("legacy Claude reasoning should remain readable"),
            "xhigh"
        );
    }

    #[test]
    fn ai_sidecar_stderr_tail_is_bounded_and_trimmed() {
        let tail = Arc::new(Mutex::new(VecDeque::new()));

        for index in 0..(AI_SIDECAR_STDERR_LINES + 2) {
            push_ai_sidecar_stderr_tail(&tail, format!(" entry-{index:02} "));
        }

        let display = ai_sidecar_stderr_tail(&tail);

        assert!(!display.contains("entry-00"));
        assert!(!display.contains("entry-01"));
        assert!(display.contains("entry-02"));
        assert!(display.contains(&format!("entry-{}", AI_SIDECAR_STDERR_LINES + 1)));
        assert!(display.starts_with(" Recent sidecar stderr: entry-02"));
    }

    #[test]
    fn ai_sidecar_timeout_error_includes_timeout_and_stderr_tail() {
        let tail = Arc::new(Mutex::new(VecDeque::new()));

        assert_eq!(
            ai_sidecar_timeout_error(&tail),
            format!(
                "AI sidecar timed out after {} seconds.",
                AI_SIDECAR_RESPONSE_TIMEOUT.as_secs()
            )
        );

        push_ai_sidecar_stderr_tail(&tail, "sidecar stack trace".to_string());

        assert_eq!(
            ai_sidecar_timeout_error(&tail),
            format!(
                "AI sidecar timed out after {} seconds. Recent sidecar stderr: sidecar stack trace",
                AI_SIDECAR_RESPONSE_TIMEOUT.as_secs()
            )
        );
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

    #[test]
    fn ai_chat_attachments_include_text_and_codex_images() {
        let root =
            env::temp_dir().join(format!("opendataverse-attachment-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("test directory should be created");
        let text_path = root.join("notes.md");
        let image_path = root.join("screen.png");
        fs::write(&text_path, "# Notes\nCheck the account form.")
            .expect("test text file should be created");
        fs::write(&image_path, b"not-a-real-png").expect("test image file should be created");
        let image_path_string = image_path.to_string_lossy().to_string();

        let bundle = prepare_ai_chat_attachments_for_paths(vec![
            text_path.to_string_lossy().to_string(),
            image_path_string.clone(),
        ])
        .expect("attachments should be prepared");

        assert_eq!(bundle.attachments.len(), 2);
        assert!(bundle.context.contains("Check the account form."));
        assert!(bundle
            .image_paths
            .iter()
            .any(|path| path == &image_path_string));
        assert!(bundle
            .attachments
            .iter()
            .any(|attachment| { attachment.kind == "image" && attachment.image_included }));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn pasted_ai_chat_images_validate_decode_and_sanitize_names() {
        let input = PastedAiChatImageInput {
            name: Some("../Screen Shot 2026-06-19.png".to_string()),
            mime_type: "image/png".to_string(),
            data_base64: BASE64.encode(b"image-bytes"),
        };

        let (bytes, extension) = decode_pasted_ai_chat_image(&input).expect("image should decode");

        assert_eq!(bytes, b"image-bytes");
        assert_eq!(extension, "png");
        assert_eq!(
            pasted_ai_chat_image_stem(input.name.as_deref()),
            "Screen-Shot-2026-06-19"
        );

        let error = decode_pasted_ai_chat_image(&PastedAiChatImageInput {
            name: None,
            mime_type: "text/plain".to_string(),
            data_base64: BASE64.encode(b"not-image"),
        })
        .expect_err("non-image MIME types should be rejected");

        assert!(error.contains("Only PNG"));
    }

    #[test]
    fn ai_node_command_finds_mise_shim_outside_shell_path() {
        let home_dir = env::temp_dir().join(format!("opendataverse-node-test-{}", Uuid::new_v4()));
        let shim_path = home_dir.join(".local/share/mise/shims/node");
        fs::create_dir_all(shim_path.parent().expect("shim should have a parent"))
            .expect("test shim directory should be created");
        fs::write(&shim_path, "").expect("test shim should be created");

        let command = ai_node_command_for(&home_dir, None, Some(std::ffi::OsStr::new("")));

        assert_eq!(command, shim_path);

        let _ = fs::remove_dir_all(home_dir);
    }
}
