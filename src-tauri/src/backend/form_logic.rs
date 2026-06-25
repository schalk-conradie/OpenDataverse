use super::*;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FormLogicEntitySummary {
    logical_name: String,
    entity_set_name: String,
    display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    primary_name_attribute: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    primary_id_attribute: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FormLogicFormSummary {
    id: String,
    name: String,
    type_code: i32,
    type_label: String,
    description: String,
    is_default: bool,
    is_managed: bool,
    form_activation_state: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FormLogicOptionValue {
    value: i32,
    label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FormLogicAttributeMetadata {
    logical_name: String,
    display_name: String,
    attribute_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    required_level: Option<String>,
    is_valid_for_read: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    lookup_targets: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    option_values: Vec<FormLogicOptionValue>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FormLogicFormContext {
    entity: FormLogicEntitySummary,
    form: FormLogicFormSummary,
    form_xml: String,
    attributes: Vec<FormLogicAttributeMetadata>,
    source: String,
}

fn form_logic_entity_from_value(value: &Value) -> FormLogicEntitySummary {
    let logical_name = json_string(value, "LogicalName").unwrap_or_default();
    let entity_set_name =
        json_string(value, "EntitySetName").unwrap_or_else(|| logical_name.clone());
    let display_name = localized_label(value, "DisplayName", &logical_name);

    FormLogicEntitySummary {
        logical_name,
        entity_set_name,
        display_name,
        primary_name_attribute: json_string(value, "PrimaryNameAttribute"),
        primary_id_attribute: json_string(value, "PrimaryIdAttribute"),
    }
}

fn form_type_label(type_code: i32) -> String {
    match type_code {
        2 => "Main",
        5 => "Mobile",
        6 => "Quick View",
        7 => "Quick Create",
        11 => "Card",
        12 => "Main Interactive",
        _ => "Form",
    }
    .to_string()
}

fn form_logic_form_from_value(value: &Value) -> Option<FormLogicFormSummary> {
    let id = json_string(value, "formid")?;
    let type_code = json_i32(value, "type").unwrap_or_default();
    let name = json_string(value, "name").unwrap_or_else(|| "Unnamed form".to_string());

    Some(FormLogicFormSummary {
        id,
        name,
        type_code,
        type_label: form_type_label(type_code),
        description: json_string(value, "description").unwrap_or_default(),
        is_default: json_bool(value, "isdefault").unwrap_or(false),
        is_managed: json_bool(value, "ismanaged").unwrap_or(false),
        form_activation_state: json_i32(value, "formactivationstate").unwrap_or_default(),
    })
}

fn required_level_from_value(value: &Value) -> Option<String> {
    value
        .get("RequiredLevel")
        .and_then(|level| {
            level
                .get("Value")
                .and_then(Value::as_str)
                .or_else(|| level.as_str())
        })
        .map(ToString::to_string)
}

fn form_logic_attribute_from_value(value: &Value) -> Option<FormLogicAttributeMetadata> {
    let logical_name = json_string(value, "LogicalName")?;
    let attribute_type =
        json_string(value, "AttributeType").unwrap_or_else(|| "Unknown".to_string());
    let display_name = localized_label(value, "DisplayName", &logical_name);
    let is_valid_for_read = value
        .get("IsValidForRead")
        .and_then(Value::as_bool)
        .unwrap_or(true);

    Some(FormLogicAttributeMetadata {
        logical_name,
        display_name,
        attribute_type,
        required_level: required_level_from_value(value),
        is_valid_for_read,
        lookup_targets: Vec::new(),
        option_values: Vec::new(),
    })
}

fn extract_xml_attribute_values(xml: &str, attribute: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut offset = 0;
    let markers = [format!("{attribute}=\""), format!("{attribute}='")];

    while offset < xml.len() {
        let Some((marker_index, marker)) = markers
            .iter()
            .filter_map(|marker| xml[offset..].find(marker).map(|index| (index, marker)))
            .min_by_key(|(index, _)| *index)
        else {
            break;
        };
        let value_start = offset + marker_index + marker.len();
        let quote = if marker.ends_with('"') { '"' } else { '\'' };
        let Some(value_end_offset) = xml[value_start..].find(quote) else {
            break;
        };
        let value = xml[value_start..value_start + value_end_offset].trim();
        if !value.is_empty() {
            values.push(value.to_string());
        }
        offset = value_start + value_end_offset + 1;
    }

    values
}

fn extract_form_field_names(form_xml: &str) -> HashSet<String> {
    extract_xml_attribute_values(form_xml, "datafieldname")
        .into_iter()
        .filter(|value| validate_logical_name(value).is_ok())
        .collect()
}

fn option_label(value: &Value) -> String {
    localized_label(value, "Label", "")
}

fn option_from_value(value: &Value) -> Option<FormLogicOptionValue> {
    Some(FormLogicOptionValue {
        value: json_i32(value, "Value")?,
        label: option_label(value),
    })
}

fn option_values_from_metadata(value: &Value) -> Vec<FormLogicOptionValue> {
    let mut options = Vec::new();

    for option_set_name in ["OptionSet", "GlobalOptionSet"] {
        let Some(option_set) = value.get(option_set_name) else {
            continue;
        };

        if let Some(items) = option_set.get("Options").and_then(Value::as_array) {
            options.extend(items.iter().filter_map(option_from_value));
        }

        for boolean_option_name in ["FalseOption", "TrueOption"] {
            if let Some(option) = option_set
                .get(boolean_option_name)
                .and_then(option_from_value)
            {
                options.push(option);
            }
        }
    }

    options.sort_by(|left, right| left.value.cmp(&right.value));
    options.dedup_by_key(|option| option.value);
    options
}

fn lookup_targets_from_metadata(value: &Value) -> Vec<String> {
    value
        .get("Targets")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn attribute_cast_for_options(attribute_type: &str) -> Option<&'static str> {
    match attribute_type {
        "Boolean" => Some("BooleanAttributeMetadata"),
        "Picklist" => Some("PicklistAttributeMetadata"),
        "MultiSelectPicklist" => Some("MultiSelectPicklistAttributeMetadata"),
        "State" => Some("StateAttributeMetadata"),
        "Status" => Some("StatusAttributeMetadata"),
        _ => None,
    }
}

fn attribute_cast_for_lookup(attribute_type: &str) -> Option<&'static str> {
    match attribute_type {
        "Customer" | "Lookup" | "Owner" => Some("LookupAttributeMetadata"),
        _ => None,
    }
}

async fn enrich_form_logic_attribute(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    entity_logical_name: &str,
    attribute: &mut FormLogicAttributeMetadata,
) {
    let Ok(attribute_logical_name) = validate_logical_name(&attribute.logical_name) else {
        return;
    };

    if let Some(cast) = attribute_cast_for_lookup(&attribute.attribute_type) {
        if let Ok(value) = dataverse_get_json_value(
            app,
            environment,
            &format!(
                "/EntityDefinitions(LogicalName='{entity_logical_name}')/Attributes(LogicalName='{attribute_logical_name}')/Microsoft.Dynamics.CRM.{cast}"
            ),
            &[("$select", "LogicalName,Targets")],
        )
        .await
        {
            attribute.lookup_targets = lookup_targets_from_metadata(&value);
        }
    }

    if let Some(cast) = attribute_cast_for_options(&attribute.attribute_type) {
        if let Ok(value) = dataverse_get_json_value(
            app,
            environment,
            &format!(
                "/EntityDefinitions(LogicalName='{entity_logical_name}')/Attributes(LogicalName='{attribute_logical_name}')/Microsoft.Dynamics.CRM.{cast}"
            ),
            &[
                ("$select", "LogicalName"),
                (
                    "$expand",
                    "OptionSet($select=Options,TrueOption,FalseOption),GlobalOptionSet($select=Options)",
                ),
            ],
        )
        .await
        {
            attribute.option_values = option_values_from_metadata(&value);
        }
    }
}

#[tauri::command]
pub(super) async fn list_form_logic_entities(
    app: AppHandle,
    environment: DataverseEnvironment,
) -> Result<Vec<FormLogicEntitySummary>, String> {
    let values = dataverse_get_collection_values(
        &app,
        &environment,
        "/EntityDefinitions",
        vec![(
            "$select".to_string(),
            "LogicalName,EntitySetName,DisplayName,PrimaryNameAttribute,PrimaryIdAttribute,IsPrivate,IsIntersect".to_string(),
        )],
    )
    .await?;
    let mut entities = values
        .iter()
        .filter(|value| {
            let logical_name = json_string(value, "LogicalName").unwrap_or_default();
            !json_bool(value, "IsPrivate").unwrap_or(false)
                && !json_bool(value, "IsIntersect").unwrap_or(false)
                && !fetchxml::is_microsoft_internal_table_name(&logical_name)
        })
        .map(form_logic_entity_from_value)
        .filter(|entity| !entity.logical_name.is_empty() && !entity.entity_set_name.is_empty())
        .collect::<Vec<_>>();

    entities.sort_by(|left, right| {
        left.display_name
            .to_lowercase()
            .cmp(&right.display_name.to_lowercase())
            .then_with(|| left.logical_name.cmp(&right.logical_name))
    });

    Ok(entities)
}

#[tauri::command]
pub(super) async fn list_form_logic_forms(
    app: AppHandle,
    environment: DataverseEnvironment,
    entity_logical_name: String,
) -> Result<Vec<FormLogicFormSummary>, String> {
    let entity_logical_name = validate_logical_name(&entity_logical_name)?;
    let values = dataverse_get_collection_values(
        &app,
        &environment,
        "/systemforms",
        vec![
            (
                "$select".to_string(),
                "formid,name,type,description,formactivationstate,isdefault,ismanaged".to_string(),
            ),
            (
                "$filter".to_string(),
                format!(
                    "objecttypecode eq '{}' and formactivationstate eq 1 and (type eq 2 or type eq 5 or type eq 6 or type eq 7 or type eq 11 or type eq 12)",
                    odata_string_literal(&entity_logical_name)
                ),
            ),
            ("$orderby".to_string(), "type asc,name asc".to_string()),
        ],
    )
    .await?;
    let mut forms = values
        .iter()
        .filter_map(form_logic_form_from_value)
        .collect::<Vec<_>>();

    forms.sort_by(|left, right| {
        right
            .is_default
            .cmp(&left.is_default)
            .then_with(|| left.type_code.cmp(&right.type_code))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    Ok(forms)
}

#[tauri::command]
pub(super) async fn get_form_logic_form_context(
    app: AppHandle,
    environment: DataverseEnvironment,
    entity_logical_name: String,
    form_id: String,
) -> Result<FormLogicFormContext, String> {
    let entity_logical_name = validate_logical_name(&entity_logical_name)?;
    let form_id = Uuid::parse_str(form_id.trim())
        .map_err(|_| "Selected form id is not a valid GUID.".to_string())?
        .to_string();
    let entity_value = dataverse_get_json_value(
        &app,
        &environment,
        &format!("/EntityDefinitions(LogicalName='{entity_logical_name}')"),
        &[(
            "$select",
            "LogicalName,EntitySetName,DisplayName,PrimaryNameAttribute,PrimaryIdAttribute",
        )],
    )
    .await?;
    let entity = form_logic_entity_from_value(&entity_value);
    let form_value = dataverse_get_json_value(
        &app,
        &environment,
        &format!("/systemforms({form_id})"),
        &[(
            "$select",
            "formid,name,type,description,formactivationstate,isdefault,ismanaged,objecttypecode,formxml",
        )],
    )
    .await?;
    let form = form_logic_form_from_value(&form_value)
        .ok_or_else(|| "Selected form did not include a form id.".to_string())?;
    let form_xml = json_string(&form_value, "formxml")
        .ok_or_else(|| "Selected form did not include FormXml.".to_string())?;
    let form_field_names = extract_form_field_names(&form_xml);

    let attribute_values = dataverse_get_collection_values(
        &app,
        &environment,
        &format!("/EntityDefinitions(LogicalName='{entity_logical_name}')/Attributes"),
        vec![(
            "$select".to_string(),
            "LogicalName,AttributeType,DisplayName,RequiredLevel,IsValidForRead".to_string(),
        )],
    )
    .await?;
    let mut attributes = attribute_values
        .iter()
        .filter_map(form_logic_attribute_from_value)
        .filter(|attribute| form_field_names.contains(&attribute.logical_name))
        .collect::<Vec<_>>();

    for attribute in &mut attributes {
        enrich_form_logic_attribute(&app, &environment, &entity_logical_name, attribute).await;
    }

    attributes.sort_by(|left, right| {
        left.display_name
            .to_lowercase()
            .cmp(&right.display_name.to_lowercase())
            .then_with(|| left.logical_name.cmp(&right.logical_name))
    });

    Ok(FormLogicFormContext {
        entity,
        form,
        form_xml,
        attributes,
        source: "dataverse".to_string(),
    })
}
