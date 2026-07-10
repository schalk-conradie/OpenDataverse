mod attachments;
mod dataverse_tools;
mod domain;
mod sidecar;

use self::{
    attachments::prepare_ai_chat_attachments_for_paths,
    dataverse_tools::execute_ai_tool_request,
    domain::{
        ai_chat_environment_dir, ai_chat_thread_path, ai_provider_display_name,
        create_ai_chat_thread, create_ai_message, create_ai_tool_message, default_ai_chat_mode,
        emit_ai_chat_message, environment_by_id, load_ai_chat_thread_from_disk,
        mark_ai_message_status, maybe_update_ai_chat_title, normalize_ai_chat_mode,
        normalize_ai_context_usage, normalize_ai_model, normalize_ai_provider,
        normalize_ai_reasoning_effort, normalize_manual_ai_chat_title, now_rfc3339,
        save_ai_chat_thread, summarize_ai_chat_thread, update_ai_thread_provider_thread_id,
        user_safe_ai_provider_error,
    },
    sidecar::{run_ai_sidecar_stream_request, AiSidecarProcess},
};
use super::storage::DataverseEnvironment;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashMap, fs, sync::Mutex};
use tauri::{AppHandle, State};
use tokio::sync::Mutex as AsyncMutex;

const AI_TOOL_REQUESTS_PER_ROUND: usize = 8;
const AI_MAX_TOOL_ROUNDS: usize = 32;

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
        &state.sidecar,
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
    attachments::save_pasted_ai_chat_image(&app, input)
}

#[tauri::command]
// Tauri exposes each field as a stable top-level IPC argument. Grouping these
// fields would break the renderer contract without reducing command complexity.
#[allow(clippy::too_many_arguments)]
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

#[cfg(test)]
mod tests {
    use super::{
        dataverse_tools::normalize_ai_get_request,
        domain::{
            ai_chat_title_from_message, normalize_ai_model, normalize_ai_provider,
            normalize_ai_reasoning_effort,
        },
        AiGetRequest,
    };

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
