use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

const CONFIG_FILE_NAME: &str = "config.json";
const USER_SETTINGS_FILE_NAME: &str = "user-settings.json";
const APP_HOME_DIR_NAME: &str = ".openDataverse";
const LEGACY_APP_HOME_DIR_NAME: &str = ".OpenDataverse";
const TOKENS_DIR_NAME: &str = "tokens";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DataverseEnvironment {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) url: String,
    pub(super) auth_state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) token_output_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WebResourceBinding {
    id: String,
    environment_id: String,
    pub(super) local_path: String,
    pub(super) web_resource_name: String,
    pub(super) web_resource_id: String,
    last_known_version: String,
    auto_publish: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AppConfig {
    current_environment_id: Option<String>,
    publisher_prefix: String,
    pub(super) environments: Vec<DataverseEnvironment>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    mode: Option<String>,
    #[serde(default = "default_appearance_theme")]
    theme: String,
}

fn default_appearance_theme() -> String {
    "opendataverse".to_string()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DangerZoneSettings {
    #[serde(default)]
    experimental_ai_agent_enabled: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UserSettings {
    #[serde(default)]
    appearance: AppearanceSettings,
    #[serde(default)]
    danger_zone: DangerZoneSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StoredToken {
    pub(super) access_token: String,
    pub(super) refresh_token: Option<String>,
    pub(super) expires_at: i64,
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

pub(super) fn legacy_opendataverse_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .home_dir()
        .map_err(|error| error.to_string())?
        .join(LEGACY_APP_HOME_DIR_NAME))
}

fn legacy_app_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|error| error.to_string())
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(opendataverse_dir(app)?.join(CONFIG_FILE_NAME))
}

fn legacy_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(legacy_app_config_dir(app)?.join(CONFIG_FILE_NAME))
}

fn legacy_home_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(legacy_opendataverse_dir(app)?.join(CONFIG_FILE_NAME))
}

fn user_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(opendataverse_dir(app)?.join(USER_SETTINGS_FILE_NAME))
}

fn token_path(app: &AppHandle, environment_id: &str) -> Result<PathBuf, String> {
    let dir = opendataverse_dir(app)?.join(TOKENS_DIR_NAME);
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join(format!("token-{environment_id}.json")))
}

fn legacy_home_token_path(app: &AppHandle, environment_id: &str) -> Result<PathBuf, String> {
    Ok(legacy_opendataverse_dir(app)?
        .join(TOKENS_DIR_NAME)
        .join(format!("token-{environment_id}.json")))
}

fn legacy_token_path(app: &AppHandle, environment_id: &str) -> Result<PathBuf, String> {
    Ok(legacy_app_config_dir(app)?
        .join(TOKENS_DIR_NAME)
        .join(format!("token-{environment_id}.json")))
}

fn delete_token_file(path: PathBuf) -> Result<(), String> {
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Could not delete {}: {error}", path.display())),
    }
}

pub(super) fn safe_storage_segment(value: &str) -> String {
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

pub(super) fn save_token(
    app: &AppHandle,
    environment_id: &str,
    token: &StoredToken,
) -> Result<(), String> {
    let path = token_path(app, environment_id)?;
    let data = serde_json::to_string_pretty(token).map_err(|error| error.to_string())?;
    fs::write(path, data).map_err(|error| error.to_string())
}

pub(super) fn load_token(app: &AppHandle, environment_id: &str) -> Result<StoredToken, String> {
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

#[cfg(test)]
mod tests {
    use super::{safe_storage_segment, UserSettings};

    #[test]
    fn safe_storage_segment_removes_path_characters() {
        assert_eq!(safe_storage_segment("../environment/id"), "environment_id");
        assert_eq!(safe_storage_segment(""), "unknown");
    }

    #[test]
    fn user_settings_preserve_appearance_theme_and_mode() {
        let settings: UserSettings = serde_json::from_value(serde_json::json!({
          "appearance": {
            "darkMode": false,
            "mode": "light",
            "theme": "catppuccin"
          },
          "dangerZone": {
            "experimentalAiAgentEnabled": true
          }
        }))
        .expect("settings should deserialize");

        let saved = serde_json::to_value(settings).expect("settings should serialize");

        assert_eq!(saved["appearance"]["darkMode"], false);
        assert_eq!(saved["appearance"]["mode"], "light");
        assert_eq!(saved["appearance"]["theme"], "catppuccin");
        assert_eq!(saved["dangerZone"]["experimentalAiAgentEnabled"], true);
    }

    #[test]
    fn legacy_dark_mode_user_settings_keep_mode_absent_for_frontend_migration() {
        let settings: UserSettings = serde_json::from_value(serde_json::json!({
          "appearance": {
            "darkMode": true
          },
          "dangerZone": {}
        }))
        .expect("legacy settings should deserialize");

        let saved = serde_json::to_value(settings).expect("settings should serialize");

        assert_eq!(saved["appearance"]["darkMode"], true);
        assert!(saved["appearance"].get("mode").is_none());
        assert_eq!(saved["appearance"]["theme"], "opendataverse");
    }
}
