use serde::Deserialize;
use serde_json::Value;
use std::{
    collections::VecDeque,
    env, fs,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Manager};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines},
    process::{Child, ChildStderr, ChildStdin, ChildStdout, Command},
    sync::Mutex as AsyncMutex,
};
use uuid::Uuid;

const AI_SIDECAR_RESPONSE_TIMEOUT: Duration = Duration::from_secs(180);
const AI_SIDECAR_STDERR_LINES: usize = 20;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiSidecarResponse {
    id: String,
    ok: Option<bool>,
    result: Option<Value>,
    error: Option<String>,
    event: Option<Value>,
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

fn ai_node_command_for(
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

fn ai_node_command(home_dir: &Path) -> PathBuf {
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

fn spawn_ai_sidecar(app: &AppHandle) -> Result<AiSidecarProcess, String> {
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

pub(super) async fn run_ai_sidecar_stream_request(
    app: &AppHandle,
    sidecar: &AsyncMutex<Option<AiSidecarProcess>>,
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
    let mut sidecar_slot = sidecar.lock().await;
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

#[cfg(test)]
mod tests {
    use super::*;

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
    fn ai_node_command_finds_mise_shim_outside_shell_path() {
        let home_dir = env::temp_dir().join(format!("opendataverse-node-test-{}", Uuid::new_v4()));
        let shim_path = path_node_candidate(home_dir.join(".local/share/mise/shims"));
        fs::create_dir_all(shim_path.parent().expect("shim should have a parent"))
            .expect("test shim directory should be created");
        fs::write(&shim_path, "").expect("test shim should be created");

        let command = ai_node_command_for(&home_dir, None, Some(std::ffi::OsStr::new("")));

        assert_eq!(command, shim_path);

        let _ = fs::remove_dir_all(home_dir);
    }
}
