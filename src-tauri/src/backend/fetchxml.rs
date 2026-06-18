use super::*;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FetchXmlEntitySummary {
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
pub(super) struct FetchXmlOptionValue {
    value: i32,
    label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FetchXmlAttributeSummary {
    logical_name: String,
    display_name: String,
    attribute_type: String,
    is_valid_for_read: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    option_values: Vec<FetchXmlOptionValue>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FetchXmlRelationshipSummary {
    id: String,
    schema_name: String,
    relationship_type: String,
    from_entity: String,
    to_entity: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    from_attribute: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    to_attribute: Option<String>,
    display_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FetchXmlEntityMetadata {
    logical_name: String,
    entity_set_name: String,
    display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    primary_name_attribute: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    primary_id_attribute: Option<String>,
    attributes: Vec<FetchXmlAttributeSummary>,
    relationships: Vec<FetchXmlRelationshipSummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FetchXmlQueryResult {
    rows: Vec<Value>,
    columns: Vec<String>,
    entity_set_name: String,
    web_api_url: String,
}
pub(super) fn is_advanced_find_entity(value: &Value) -> bool {
    let logical_name = json_string(value, "LogicalName").unwrap_or_default();

    json_bool(value, "IsValidForAdvancedFind").unwrap_or(false)
        && !json_bool(value, "IsPrivate").unwrap_or(false)
        && !json_bool(value, "IsIntersect").unwrap_or(false)
        && !is_microsoft_internal_table_name(&logical_name)
}

pub(super) fn fetchxml_entity_summary_from_value(value: &Value) -> FetchXmlEntitySummary {
    let logical_name = json_string(value, "LogicalName").unwrap_or_default();
    let entity_set_name =
        json_string(value, "EntitySetName").unwrap_or_else(|| logical_name.clone());
    let display_name = localized_label(value, "DisplayName", &logical_name);

    FetchXmlEntitySummary {
        logical_name,
        entity_set_name,
        display_name,
        primary_name_attribute: json_string(value, "PrimaryNameAttribute"),
        primary_id_attribute: json_string(value, "PrimaryIdAttribute"),
    }
}

pub(super) fn is_advanced_find_attribute(value: &Value) -> bool {
    value
        .get("IsValidForRead")
        .and_then(Value::as_bool)
        .unwrap_or(true)
        && json_bool(value, "IsValidForAdvancedFind").unwrap_or(true)
}

pub(super) fn is_microsoft_internal_table_name(value: &str) -> bool {
    let lower = value.to_lowercase();

    lower.contains("msyn_") || lower.contains("msdyn")
}

pub(super) fn is_valid_designer_relationship(
    relationship: &FetchXmlRelationshipSummary,
    advanced_find_entities: &HashSet<String>,
) -> bool {
    advanced_find_entities.contains(&relationship.from_entity)
        && advanced_find_entities.contains(&relationship.to_entity)
        && !is_microsoft_internal_table_name(&relationship.from_entity)
        && !is_microsoft_internal_table_name(&relationship.to_entity)
        && relationship.from_attribute.is_some()
        && relationship.to_attribute.is_some()
}

pub(super) fn fetchxml_attribute_from_value(value: &Value) -> Option<FetchXmlAttributeSummary> {
    let logical_name = json_string(value, "LogicalName")?;
    let attribute_type =
        json_string(value, "AttributeType").unwrap_or_else(|| "Unknown".to_string());
    let display_name = localized_label(value, "DisplayName", &logical_name);
    let is_valid_for_read = value
        .get("IsValidForRead")
        .and_then(Value::as_bool)
        .unwrap_or(true);

    Some(FetchXmlAttributeSummary {
        logical_name,
        display_name,
        attribute_type,
        is_valid_for_read,
        option_values: Vec::new(),
    })
}

pub(super) async fn advanced_find_entity_logical_names(
    app: &AppHandle,
    environment: &DataverseEnvironment,
) -> Result<HashSet<String>, String> {
    let values = dataverse_get_collection_values(
        app,
        environment,
        "/EntityDefinitions",
        vec![(
            "$select".to_string(),
            "LogicalName,IsValidForAdvancedFind,IsPrivate,IsIntersect".to_string(),
        )],
    )
    .await?;

    Ok(values
        .iter()
        .filter(|value| is_advanced_find_entity(value))
        .filter_map(|value| json_string(value, "LogicalName"))
        .collect())
}

pub(super) fn sort_fetchxml_attributes(attributes: &mut [FetchXmlAttributeSummary]) {
    attributes.sort_by(|left, right| {
        left.display_name
            .to_lowercase()
            .cmp(&right.display_name.to_lowercase())
            .then_with(|| left.logical_name.cmp(&right.logical_name))
    });
}

pub(super) fn sort_fetchxml_relationships(relationships: &mut [FetchXmlRelationshipSummary]) {
    relationships.sort_by(|left, right| {
        left.display_name
            .to_lowercase()
            .cmp(&right.display_name.to_lowercase())
            .then_with(|| left.schema_name.cmp(&right.schema_name))
    });
}

pub(super) fn many_to_one_relationship_from_value(
    value: &Value,
) -> Option<FetchXmlRelationshipSummary> {
    let schema_name = json_string(value, "SchemaName")?;
    let from_entity = json_string(value, "ReferencedEntity")?;
    let to_entity = json_string(value, "ReferencingEntity")?;
    let from_attribute = json_string(value, "ReferencedAttribute");
    let to_attribute = json_string(value, "ReferencingAttribute");

    Some(FetchXmlRelationshipSummary {
        id: format!("many-to-one:{schema_name}"),
        display_name: format!("{schema_name} ({from_entity})"),
        schema_name,
        relationship_type: "many-to-one".to_string(),
        from_entity,
        to_entity,
        from_attribute,
        to_attribute,
    })
}

pub(super) fn one_to_many_relationship_from_value(
    value: &Value,
) -> Option<FetchXmlRelationshipSummary> {
    let schema_name = json_string(value, "SchemaName")?;
    let from_entity = json_string(value, "ReferencingEntity")?;
    let to_entity = json_string(value, "ReferencedEntity")?;
    let from_attribute = json_string(value, "ReferencingAttribute");
    let to_attribute = json_string(value, "ReferencedAttribute");

    Some(FetchXmlRelationshipSummary {
        id: format!("one-to-many:{schema_name}"),
        display_name: format!("{schema_name} ({from_entity})"),
        schema_name,
        relationship_type: "one-to-many".to_string(),
        from_entity,
        to_entity,
        from_attribute,
        to_attribute,
    })
}

pub(super) fn many_to_many_relationship_from_value(
    current_entity: &str,
    value: &Value,
) -> Option<FetchXmlRelationshipSummary> {
    let schema_name = json_string(value, "SchemaName")?;
    let entity_one = json_string(value, "Entity1LogicalName")?;
    let entity_two = json_string(value, "Entity2LogicalName")?;
    let from_entity = if entity_one == current_entity {
        entity_two
    } else {
        entity_one
    };

    Some(FetchXmlRelationshipSummary {
        id: format!("many-to-many:{schema_name}"),
        display_name: format!("{schema_name} ({from_entity})"),
        schema_name,
        relationship_type: "many-to-many".to_string(),
        from_entity,
        to_entity: current_entity.to_string(),
        from_attribute: None,
        to_attribute: None,
    })
}

pub(super) fn extract_fetchxml_entity_name(fetch_xml: &str) -> Result<String, String> {
    let lower = fetch_xml.to_lowercase();
    let entity_start = lower
        .find("<entity")
        .ok_or_else(|| "FetchXML must include one entity element.".to_string())?;
    let entity_slice = fetch_xml
        .get(entity_start..)
        .ok_or_else(|| "FetchXML entity element could not be read.".to_string())?;
    let tag_end = entity_slice
        .find('>')
        .ok_or_else(|| "FetchXML entity element is not closed.".to_string())?;
    let tag = &entity_slice[..tag_end];

    for quote in ['"', '\''] {
        let marker = format!("name={quote}");
        if let Some(name_start) = tag.to_lowercase().find(&marker) {
            let value_start = name_start + marker.len();
            let rest = &tag[value_start..];
            let value_end = rest
                .find(quote)
                .ok_or_else(|| "FetchXML entity name attribute is not closed.".to_string())?;
            return validate_logical_name(&rest[..value_end]);
        }
    }

    Err("FetchXML entity element must include a name attribute.".to_string())
}

pub(super) fn collect_result_columns(rows: &[Value]) -> Vec<String> {
    let mut columns = Vec::new();

    for row in rows {
        let Some(object) = row.as_object() else {
            continue;
        };

        for key in object.keys() {
            if key.starts_with('@') || key.contains("@odata.") {
                continue;
            }

            if !columns.iter().any(|column| column == key) {
                columns.push(key.clone());
            }
        }
    }

    columns
}

pub(super) fn fetchxml_web_api_url(
    environment: &DataverseEnvironment,
    entity_set_name: &str,
    fetch_xml: &str,
) -> String {
    let mut query = form_urlencoded::Serializer::new(String::new());
    query.append_pair("fetchXml", fetch_xml);

    format!(
        "{}/api/data/v9.2/{}?{}",
        normalize_org_url(&environment.url),
        entity_set_name,
        query.finish()
    )
}
#[tauri::command]
pub(super) async fn list_fetchxml_entities(
    app: AppHandle,
    environment: DataverseEnvironment,
) -> Result<Vec<FetchXmlEntitySummary>, String> {
    let values = dataverse_get_collection_values(
    &app,
    &environment,
    "/EntityDefinitions",
    vec![(
      "$select".to_string(),
      "LogicalName,EntitySetName,DisplayName,PrimaryNameAttribute,PrimaryIdAttribute,IsValidForAdvancedFind,IsPrivate,IsIntersect".to_string(),
    )],
  )
  .await?;
    let mut entities = values
        .iter()
        .filter(|value| is_advanced_find_entity(value))
        .map(fetchxml_entity_summary_from_value)
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
pub(super) async fn get_fetchxml_entity_metadata(
    app: AppHandle,
    environment: DataverseEnvironment,
    logical_name: String,
) -> Result<FetchXmlEntityMetadata, String> {
    let logical_name = validate_logical_name(&logical_name)?;
    let entity_value = dataverse_get_json_value(
        &app,
        &environment,
        &format!("/EntityDefinitions(LogicalName='{logical_name}')"),
        &[(
            "$select",
            "LogicalName,EntitySetName,DisplayName,PrimaryNameAttribute,PrimaryIdAttribute",
        )],
    )
    .await?;
    let entity = fetchxml_entity_summary_from_value(&entity_value);

    let attribute_values = dataverse_get_collection_values(
        &app,
        &environment,
        &format!("/EntityDefinitions(LogicalName='{logical_name}')/Attributes"),
        vec![(
            "$select".to_string(),
            "LogicalName,AttributeType,DisplayName,IsValidForRead,IsValidForAdvancedFind"
                .to_string(),
        )],
    )
    .await?;
    let mut attributes = attribute_values
        .iter()
        .filter(|value| is_advanced_find_attribute(value))
        .filter_map(fetchxml_attribute_from_value)
        .collect::<Vec<_>>();
    sort_fetchxml_attributes(&mut attributes);

    let mut relationships = Vec::new();
    let many_to_one_values = dataverse_get_collection_values(
        &app,
        &environment,
        &format!("/EntityDefinitions(LogicalName='{logical_name}')/ManyToOneRelationships"),
        vec![(
      "$select".to_string(),
      "SchemaName,ReferencedEntity,ReferencedAttribute,ReferencingEntity,ReferencingAttribute"
        .to_string(),
    )],
    )
    .await?;
    relationships.extend(
        many_to_one_values
            .iter()
            .filter_map(many_to_one_relationship_from_value),
    );

    let one_to_many_values = dataverse_get_collection_values(
        &app,
        &environment,
        &format!("/EntityDefinitions(LogicalName='{logical_name}')/OneToManyRelationships"),
        vec![(
      "$select".to_string(),
      "SchemaName,ReferencedEntity,ReferencedAttribute,ReferencingEntity,ReferencingAttribute"
        .to_string(),
    )],
    )
    .await?;
    relationships.extend(
        one_to_many_values
            .iter()
            .filter_map(one_to_many_relationship_from_value),
    );

    let many_to_many_values = dataverse_get_collection_values(
    &app,
    &environment,
    &format!("/EntityDefinitions(LogicalName='{logical_name}')/ManyToManyRelationships"),
    vec![(
      "$select".to_string(),
      "SchemaName,Entity1LogicalName,Entity1IntersectAttribute,Entity2LogicalName,Entity2IntersectAttribute"
        .to_string(),
    )],
  )
  .await?;
    relationships.extend(
        many_to_many_values
            .iter()
            .filter_map(|value| many_to_many_relationship_from_value(&logical_name, value)),
    );
    let advanced_find_entities = advanced_find_entity_logical_names(&app, &environment).await?;
    relationships.retain(|relationship| {
        is_valid_designer_relationship(relationship, &advanced_find_entities)
    });
    sort_fetchxml_relationships(&mut relationships);

    Ok(FetchXmlEntityMetadata {
        logical_name: entity.logical_name,
        entity_set_name: entity.entity_set_name,
        display_name: entity.display_name,
        primary_name_attribute: entity.primary_name_attribute,
        primary_id_attribute: entity.primary_id_attribute,
        attributes,
        relationships,
    })
}

#[tauri::command]
pub(super) async fn execute_fetchxml_query(
    app: AppHandle,
    environment: DataverseEnvironment,
    fetch_xml: String,
) -> Result<FetchXmlQueryResult, String> {
    let logical_name = extract_fetchxml_entity_name(&fetch_xml)?;
    let entity_value = dataverse_get_json_value(
        &app,
        &environment,
        &format!("/EntityDefinitions(LogicalName='{logical_name}')"),
        &[("$select", "LogicalName,EntitySetName")],
    )
    .await?;
    let entity = fetchxml_entity_summary_from_value(&entity_value);

    if entity.entity_set_name.is_empty() {
        return Err(format!(
            "Could not resolve an entity set name for {logical_name}."
        ));
    }

    let response = dataverse_get_json_value(
        &app,
        &environment,
        &format!("/{}", entity.entity_set_name),
        &[("fetchXml", &fetch_xml)],
    )
    .await?;
    let rows = response
        .get("value")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let columns = collect_result_columns(&rows);
    let web_api_url = fetchxml_web_api_url(&environment, &entity.entity_set_name, &fetch_xml);

    Ok(FetchXmlQueryResult {
        rows,
        columns,
        entity_set_name: entity.entity_set_name,
        web_api_url,
    })
}
