use super::{
    AiCatalogOption, AiChatContextUsage, AiChatMessage, AiChatStreamEvent, AiChatThread,
    AiChatThreadSummary, AiModelCatalog, AiProviderCatalog,
};
use crate::backend::storage::{
    legacy_opendataverse_dir, load_config, safe_storage_segment, DataverseEnvironment,
};
use serde_json::Value;
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

const AI_CHATS_DIR_NAME: &str = "ai-chats";
const AI_CHAT_EVENT: &str = "ai-chat-event";
const AI_MODEL_CATALOG_JSON: &str = include_str!("../../../../src/core/ai/model-catalog.json");

pub(super) fn now_rfc3339() -> Result<String, String> {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(|error| error.to_string())
}

pub(super) fn normalize_ai_context_usage(
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

fn ai_chat_history_root(app: &AppHandle) -> Result<PathBuf, String> {
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
