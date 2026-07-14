use super::storage::{load_token, save_token, DataverseEnvironment, StoredToken};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use url::Url;

pub(super) const CLIENT_ID: &str = "51f81489-12ee-4a9e-aaae-a2591f45987d";
pub(super) const AUTHORITY_BASE: &str = "https://login.microsoftonline.com/common";
pub(super) const REDIRECT_URI: &str = "http://localhost:8400";

#[derive(Debug, Deserialize)]
pub(super) struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    error: Option<String>,
    error_description: Option<String>,
}

pub(super) fn now_unix() -> Result<i64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .map_err(|error| error.to_string())
}

pub(super) fn normalize_org_url(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

pub(super) fn auth_scope(org_url: &str) -> String {
    format!("{}/.default offline_access", normalize_org_url(org_url))
}

pub(super) fn api_url(org_url: &str, path: &str) -> String {
    format!("{}/api/data/v9.2{}", normalize_org_url(org_url), path)
}

pub(super) fn token_from_response(response: TokenResponse) -> Result<StoredToken, String> {
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

pub(super) async fn access_token_for(
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

pub(super) async fn dataverse_get(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    path: &str,
    query: &[(&str, &str)],
) -> Result<String, String> {
    dataverse_get_with_headers(app, environment, path, query, &[]).await
}

pub(super) async fn dataverse_get_with_headers(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    path: &str,
    query: &[(&str, &str)],
    headers: &[(&str, String)],
) -> Result<String, String> {
    let access_token = access_token_for(app, environment).await?;
    let client = Client::new();
    let mut request = client
        .get(api_url(&environment.url, path))
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .header("OData-MaxVersion", "4.0")
        .header("OData-Version", "4.0")
        .query(query);

    for (name, value) in headers {
        request = request.header(*name, value);
    }

    let response = request.send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("Dataverse GET failed ({status}): {body}"));
    }

    Ok(body)
}

pub(super) async fn dataverse_json_request<T: Serialize + ?Sized>(
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

pub(super) async fn dataverse_empty_request(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    method: reqwest::Method,
    path: &str,
) -> Result<(), String> {
    let access_token = access_token_for(app, environment).await?;
    let client = Client::new();
    let response = client
        .request(method, api_url(&environment.url, path))
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .header("OData-MaxVersion", "4.0")
        .header("OData-Version", "4.0")
        .header("If-Match", "*")
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

pub(super) async fn dataverse_post_json_with_headers<T: Serialize + ?Sized>(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    path: &str,
    payload: &T,
    headers: &[(&str, String)],
) -> Result<(String, Option<String>), String> {
    let access_token = access_token_for(app, environment).await?;
    let client = Client::new();
    let mut request = client
        .post(api_url(&environment.url, path))
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("OData-MaxVersion", "4.0")
        .header("OData-Version", "4.0")
        .header("If-None-Match", "null")
        .json(payload);

    for (name, value) in headers {
        request = request.header(*name, value);
    }

    let response = request.send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    let entity_id = response
        .headers()
        .get("OData-EntityId")
        .or_else(|| response.headers().get("odata-entityid"))
        .and_then(|value| value.to_str().ok())
        .map(ToString::to_string);
    let body = response.text().await.map_err(|error| error.to_string())?;

    if !status.is_success() {
        return Err(format!("Dataverse request failed ({status}): {body}"));
    }

    Ok((body, entity_id))
}

pub(super) async fn dataverse_get_json_value(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    path: &str,
    query: &[(&str, &str)],
) -> Result<Value, String> {
    let body = dataverse_get(app, environment, path, query).await?;
    serde_json::from_str(&body).map_err(|error| format!("Parse Dataverse JSON response: {error}"))
}

pub(super) async fn dataverse_get_json_value_with_headers(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    path: &str,
    query: &[(&str, &str)],
    headers: &[(&str, String)],
) -> Result<Value, String> {
    let body = dataverse_get_with_headers(app, environment, path, query, headers).await?;
    serde_json::from_str(&body).map_err(|error| format!("Parse Dataverse JSON response: {error}"))
}

fn normalize_dataverse_next_link(
    environment: &DataverseEnvironment,
    next_link: &str,
) -> Result<(String, Vec<(String, String)>), String> {
    let parsed = Url::parse(next_link).map_err(|error| error.to_string())?;
    let org_url =
        Url::parse(&normalize_org_url(&environment.url)).map_err(|error| error.to_string())?;

    if parsed.scheme() != org_url.scheme()
        || parsed.host_str() != org_url.host_str()
        || parsed.port_or_known_default() != org_url.port_or_known_default()
    {
        return Err("Dataverse nextLink did not match the selected environment.".to_string());
    }

    let path = parsed
        .path()
        .strip_prefix("/api/data/v9.2")
        .ok_or_else(|| "Dataverse nextLink used an unexpected API path.".to_string())?;
    let query = parsed
        .query_pairs()
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();

    Ok((format!("/{}", path.trim_start_matches('/')), query))
}

pub(super) async fn dataverse_get_collection_values(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    path: &str,
    query: Vec<(String, String)>,
) -> Result<Vec<Value>, String> {
    dataverse_get_collection_values_with_headers(app, environment, path, query, &[]).await
}

pub(super) async fn dataverse_get_collection_values_with_headers(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    path: &str,
    query: Vec<(String, String)>,
    headers: &[(&str, String)],
) -> Result<Vec<Value>, String> {
    let mut values = Vec::new();
    let mut current_path = path.to_string();
    let mut current_query = query;

    for _ in 0..30 {
        let query_refs = current_query
            .iter()
            .map(|(key, value)| (key.as_str(), value.as_str()))
            .collect::<Vec<_>>();
        let page = dataverse_get_json_value_with_headers(
            app,
            environment,
            &current_path,
            &query_refs,
            headers,
        )
        .await?;

        if let Some(items) = page.get("value").and_then(Value::as_array) {
            values.extend(items.iter().cloned());
        }

        let Some(next_link) = page.get("@odata.nextLink").and_then(Value::as_str) else {
            return Ok(values);
        };
        let (next_path, next_query) = normalize_dataverse_next_link(environment, next_link)?;
        current_path = next_path;
        current_query = next_query;
    }

    Err("Dataverse paging exceeded the metadata page limit.".to_string())
}

pub(super) fn json_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

pub(super) fn json_bool(value: &Value, key: &str) -> Option<bool> {
    value.get(key).and_then(|item| {
        item.as_bool()
            .or_else(|| item.get("Value").and_then(Value::as_bool))
    })
}

pub(super) fn json_i32(value: &Value, key: &str) -> Option<i32> {
    value
        .get(key)
        .and_then(Value::as_i64)
        .and_then(|item| i32::try_from(item).ok())
}

pub(super) fn json_i64(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(Value::as_i64)
}

pub(super) fn json_lookup_id(value: &Value, key: &str) -> Option<String> {
    json_string(value, key).or_else(|| json_string(value, &format!("_{key}_value")))
}

pub(super) fn json_expanded_string(value: &Value, navigation: &str, key: &str) -> Option<String> {
    value
        .get(navigation)
        .and_then(|item| json_string(item, key))
}

pub(super) fn localized_label(value: &Value, key: &str, fallback: &str) -> String {
    value
        .get(key)
        .and_then(|display_name| {
            display_name
                .get("UserLocalizedLabel")
                .and_then(|label| label.get("Label"))
                .and_then(Value::as_str)
                .or_else(|| {
                    display_name
                        .get("LocalizedLabels")
                        .and_then(Value::as_array)
                        .and_then(|labels| labels.first())
                        .and_then(|label| label.get("Label"))
                        .and_then(Value::as_str)
                })
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| fallback.to_string())
}

pub(super) fn odata_string_literal(value: &str) -> String {
    value.replace('\'', "''")
}

pub(super) fn guid_from_entity_id(value: &str) -> Option<String> {
    let start = value.rfind('(')? + 1;
    let end = value.rfind(')')?;
    (start < end).then(|| value[start..end].to_string())
}

pub(super) fn validate_logical_name(value: &str) -> Result<String, String> {
    let trimmed = value
        .trim()
        .trim_matches(|ch: char| ch == '\'' || ch == '"' || ch == '`');
    let mut chars = trimmed.chars();
    let first = chars
        .next()
        .ok_or_else(|| "Logical name is required.".to_string())?;

    if !(first.is_ascii_alphabetic() || first == '_') {
        return Err("Logical name must start with a letter or underscore.".to_string());
    }

    if !chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_') {
        return Err("Logical name can contain only letters, numbers, and underscores.".to_string());
    }

    if trimmed.len() > 128 {
        return Err("Logical name is too long.".to_string());
    }

    Ok(trimmed.to_string())
}
