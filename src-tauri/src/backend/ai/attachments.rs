use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use super::{AiChatAttachment, AiChatAttachmentBundle, PastedAiChatImage, PastedAiChatImageInput};

const AI_ATTACHMENT_MAX_SELECTED_PATHS: usize = 24;
const AI_ATTACHMENT_MAX_FOLDER_FILES: usize = 80;
const AI_ATTACHMENT_MAX_TEXT_FILE_BYTES: u64 = 1_000_000;
const AI_ATTACHMENT_MAX_TEXT_CHARS_PER_FILE: usize = 12_000;
const AI_ATTACHMENT_MAX_TOTAL_CONTEXT_CHARS: usize = 80_000;
const AI_ATTACHMENT_MAX_CODEX_IMAGES: usize = 6;
const AI_PASTED_IMAGES_DIR_NAME: &str = "ai-chat-pasted-images";
const AI_PASTED_IMAGE_MAX_BYTES: usize = 15_000_000;

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
    let max_encoded_len = AI_PASTED_IMAGE_MAX_BYTES.div_ceil(3) * 4 + 16;

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

pub(super) fn save_pasted_ai_chat_image(
    app: &AppHandle,
    input: PastedAiChatImageInput,
) -> Result<PastedAiChatImage, String> {
    let (bytes, extension) = decode_pasted_ai_chat_image(&input)?;
    let path = pasted_ai_chat_image_path(app, input.name.as_deref(), extension)?;

    fs::write(&path, bytes).map_err(|error| error.to_string())?;

    Ok(PastedAiChatImage {
        path: path.to_string_lossy().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

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
}
