use super::web_resources::{is_microsoft_web_resource_name, map_resource_type, resource_type_code};
use super::*;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SolutionSummary {
    id: String,
    unique_name: String,
    friendly_name: String,
    version: String,
    is_managed: bool,
    is_visible: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    publisher_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    publisher_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    publisher_unique_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    publisher_prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_on: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_on: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    component_count: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SolutionComponentSummary {
    id: String,
    solution_id: String,
    object_id: String,
    component_type: i32,
    component_type_label: String,
    group: String,
    display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    logical_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    schema_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_managed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_on: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_on: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    root_component_behavior: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    root_component_behavior_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    root_solution_component_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    related_entity_logical_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    related_record_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    layer_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SolutionDependencyItem {
    id: String,
    dependency_type: i32,
    dependency_type_label: String,
    dependent_component_type: i32,
    dependent_component_type_label: String,
    dependent_component_object_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    dependent_component_parent_id: Option<String>,
    required_component_type: i32,
    required_component_type_label: String,
    required_component_object_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    required_component_parent_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SolutionDependencyReport {
    required: Vec<SolutionDependencyItem>,
    dependents: Vec<SolutionDependencyItem>,
    delete_blockers: Vec<SolutionDependencyItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SolutionLayer {
    id: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    component_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    solution_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    publisher_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    order: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    overwrite_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    changes: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SolutionWebResourceCandidate {
    id: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    display_name: Option<String>,
    #[serde(rename = "type")]
    resource_type: String,
    type_code: i32,
    is_managed: bool,
    in_solution: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_on: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateWebResourceInput {
    solution_unique_name: String,
    name: String,
    display_name: String,
    description: String,
    #[serde(rename = "type")]
    resource_type: String,
    content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SolutionWriteResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    web_resource_id: Option<String>,
    message: String,
}

pub(super) fn solution_component_type_label(component_type: i32) -> &'static str {
    match component_type {
        1 => "Table",
        2 => "Column",
        3 => "Relationship",
        4 => "Column Choice Value",
        5 => "Column Lookup Value",
        6 => "View Column",
        7 => "Localized Label",
        8 => "Relationship Extra Condition",
        9 => "Choice",
        10 => "Table Relationship",
        11 => "Table Relationship Role",
        12 => "Table Relationship Relationship",
        13 => "Managed Property",
        14 => "Table Key",
        16 => "Privilege",
        17 => "Privilege Object Type",
        18 => "Index",
        20 => "Security Role",
        21 => "Role Privilege",
        22 => "Display String",
        23 => "Display String Map",
        24 => "Form",
        25 => "Organization",
        26 => "View",
        29 => "Process",
        31 => "Report",
        32 => "Report Table",
        33 => "Report Category",
        34 => "Report Visibility",
        35 => "Attachment",
        36 => "Email Template",
        37 => "Contract Template",
        38 => "KB Article Template",
        39 => "Mail Merge Template",
        44 => "Duplicate Rule",
        45 => "Duplicate Rule Condition",
        46 => "Table Map",
        47 => "Column Map",
        48 => "Ribbon Command",
        49 => "Ribbon Context Group",
        50 => "Ribbon Customization",
        52 => "Ribbon Rule",
        53 => "Ribbon Tab To Command Map",
        55 => "Ribbon Diff",
        59 => "Chart",
        60 => "System Form",
        61 => "Web Resource",
        90 => "Plug-in Type",
        91 => "Plug-in Assembly",
        92 => "SDK Message Processing Step",
        93 => "SDK Message Processing Step Image",
        95 => "Service Endpoint",
        62 => "Site Map",
        63 => "Connection Role",
        64 => "Complex Control",
        65 => "Hierarchy Rule",
        66 => "Custom Control",
        68 => "Custom Control Default Config",
        70 => "Field Security Profile",
        71 => "Field Permission",
        150 => "Routing Rule",
        151 => "Routing Rule Item",
        152 => "SLA",
        153 => "SLA Item",
        154 => "Convert Rule",
        155 => "Convert Rule Item",
        161 => "Mobile Offline Profile",
        162 => "Mobile Offline Profile Item",
        165 => "Similarity Rule",
        166 => "Data Source Mapping",
        201 => "SDK Message",
        202 => "SDK Message Filter",
        203 => "SDK Message Pair",
        204 => "SDK Message Request",
        205 => "SDK Message Request Field",
        206 => "SDK Message Response",
        207 => "SDK Message Response Field",
        208 => "Import Map",
        210 => "Web Wizard",
        300 => "Canvas App",
        371 | 372 => "Connector",
        380 => "Environment Variable Definition",
        381 => "Environment Variable Value",
        400 => "AI Project Type",
        401 => "AI Project",
        402 => "AI Configuration",
        430 => "Table Analytics Configuration",
        431 => "Column Image Configuration",
        432 => "Table Image Configuration",
        _ => "Component",
    }
}

pub(super) fn solution_component_group(component_type: i32) -> &'static str {
    match component_type {
        1 => "Tables",
        2 => "Columns",
        3 | 10 | 11 | 12 => "Relationships",
        4 | 5 | 9 => "Choices",
        14 | 18 => "Keys and Indexes",
        20 | 21 | 70 | 71 => "Security",
        24 | 60 => "Forms",
        26 => "Views",
        29 => "Processes",
        31 | 32 | 33 | 34 => "Reports",
        48 | 49 | 50 | 52 | 53 | 55 => "Ribbon",
        59 => "Charts",
        61 => "Web Resources",
        62 => "Site Maps",
        90 | 91 | 92 | 93 | 95 | 201 | 202 | 203 | 204 | 205 | 206 | 207 => "Developer Extensions",
        300 => "Apps",
        371 | 372 => "Connectors",
        380 | 381 => "Environment Variables",
        400..=402 => "AI",
        _ => "Other",
    }
}

pub(super) fn dependency_type_label(dependency_type: i32) -> &'static str {
    match dependency_type {
        1 => "Solution Internal",
        2 => "Published",
        4 => "Unpublished",
        _ => "None",
    }
}

pub(super) fn root_component_behavior_label(value: Option<i32>) -> Option<String> {
    value.map(|behavior| {
        match behavior {
            0 => "Include subcomponents",
            1 => "Do not include subcomponents",
            2 => "Include as shell only",
            _ => "Unknown",
        }
        .to_string()
    })
}

pub(super) fn web_resource_record_url(
    environment: &DataverseEnvironment,
    entity: &str,
    object_id: &str,
) -> String {
    let mut query = form_urlencoded::Serializer::new(String::new());
    query.append_pair("pagetype", "entityrecord");
    query.append_pair("etn", entity);
    query.append_pair("id", object_id);

    format!(
        "{}/main.aspx?{}",
        normalize_org_url(&environment.url),
        query.finish()
    )
}
pub(super) fn solution_from_value(
    value: &Value,
    component_count: Option<usize>,
) -> SolutionSummary {
    let id = json_string(value, "solutionid").unwrap_or_default();
    let publisher = value.get("publisherid").unwrap_or(&Value::Null);

    SolutionSummary {
        id,
        unique_name: json_string(value, "uniquename").unwrap_or_default(),
        friendly_name: json_string(value, "friendlyname")
            .or_else(|| json_string(value, "uniquename"))
            .unwrap_or_else(|| "Solution".to_string()),
        version: json_string(value, "version").unwrap_or_default(),
        is_managed: json_bool(value, "ismanaged").unwrap_or(false),
        is_visible: json_bool(value, "isvisible").unwrap_or(true),
        publisher_id: json_string(value, "_publisherid_value")
            .or_else(|| json_string(publisher, "publisherid")),
        publisher_name: json_string(publisher, "friendlyname"),
        publisher_unique_name: json_string(publisher, "uniquename"),
        publisher_prefix: json_string(publisher, "customizationprefix"),
        created_on: json_string(value, "createdon"),
        modified_on: json_string(value, "modifiedon"),
        component_count,
    }
}

pub(super) fn solution_managed_filter(value: Option<&str>) -> Result<&'static str, String> {
    match value.unwrap_or("unmanaged") {
        "all" => Ok("isvisible eq true"),
        "managed" => Ok("isvisible eq true and ismanaged eq true"),
        "unmanaged" => Ok("isvisible eq true and ismanaged eq false"),
        other => Err(format!("Unsupported solution filter: {other}")),
    }
}

pub(super) async fn solution_component_values(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    solution_id: &str,
) -> Result<Vec<Value>, String> {
    dataverse_get_collection_values(
    app,
    environment,
    "/solutioncomponents",
    vec![
      (
        "$select".to_string(),
        "solutioncomponentid,_solutionid_value,componenttype,objectid,ismetadata,rootcomponentbehavior,rootsolutioncomponentid,createdon,modifiedon,versionnumber".to_string(),
      ),
      (
        "$filter".to_string(),
        format!("_solutionid_value eq {solution_id}"),
      ),
      ("$orderby".to_string(), "componenttype asc,modifiedon desc".to_string()),
    ],
  )
  .await
}

pub(super) fn solution_component_from_value(value: &Value) -> Option<SolutionComponentSummary> {
    let id = json_string(value, "solutioncomponentid")?;
    let object_id = json_string(value, "objectid")?;
    let solution_id = json_string(value, "_solutionid_value").unwrap_or_default();
    let component_type = json_i32(value, "componenttype").unwrap_or_default();
    let root_component_behavior = json_i32(value, "rootcomponentbehavior");
    let component_type_label = solution_component_type_label(component_type).to_string();

    Some(SolutionComponentSummary {
        id,
        solution_id,
        object_id: object_id.clone(),
        component_type,
        component_type_label: component_type_label.clone(),
        group: solution_component_group(component_type).to_string(),
        display_name: format!(
            "{component_type_label} {}",
            &object_id[..object_id.len().min(8)]
        ),
        logical_name: None,
        schema_name: None,
        is_managed: None,
        created_on: json_string(value, "createdon"),
        modified_on: json_string(value, "modifiedon"),
        root_component_behavior,
        root_component_behavior_label: root_component_behavior_label(root_component_behavior),
        root_solution_component_id: json_string(value, "rootsolutioncomponentid"),
        version: json_i64(value, "versionnumber").map(|version| version.to_string()),
        related_entity_logical_name: None,
        related_record_url: None,
        layer_name: None,
    })
}

pub(super) async fn optional_dataverse_get_json_value(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    path: &str,
    query: &[(&str, &str)],
) -> Option<Value> {
    dataverse_get_json_value(app, environment, path, query)
        .await
        .ok()
}

pub(super) fn apply_table_detail(component: &mut SolutionComponentSummary, value: &Value) {
    let logical_name = json_string(value, "LogicalName");
    let schema_name = json_string(value, "SchemaName");
    let display_name = localized_label(
        value,
        "DisplayName",
        logical_name.as_deref().unwrap_or(&component.display_name),
    );

    component.display_name = display_name;
    component.logical_name = logical_name.clone();
    component.schema_name = schema_name;
    component.is_managed = json_bool(value, "IsManaged");
    component.modified_on =
        json_string(value, "ModifiedOn").or_else(|| component.modified_on.clone());
    component.layer_name = logical_name;
}

pub(super) fn apply_choice_detail(component: &mut SolutionComponentSummary, value: &Value) {
    let name = json_string(value, "Name");
    component.display_name = localized_label(
        value,
        "DisplayName",
        name.as_deref().unwrap_or(&component.display_name),
    );
    component.logical_name = name.clone();
    component.schema_name = name.clone();
    component.is_managed = json_bool(value, "IsManaged");
    component.layer_name = name;
}

pub(super) fn apply_table_row_detail(
    component: &mut SolutionComponentSummary,
    value: &Value,
    display_keys: &[&str],
    logical_keys: &[&str],
    schema_keys: &[&str],
    entity_logical_name: &str,
    environment: &DataverseEnvironment,
) {
    if let Some(display_name) = display_keys.iter().find_map(|key| json_string(value, key)) {
        component.display_name = display_name;
    }

    component.logical_name = logical_keys.iter().find_map(|key| json_string(value, key));
    component.schema_name = schema_keys.iter().find_map(|key| json_string(value, key));
    component.is_managed = json_bool(value, "ismanaged");
    component.modified_on =
        json_string(value, "modifiedon").or_else(|| component.modified_on.clone());
    component.related_entity_logical_name = Some(entity_logical_name.to_string());
    component.related_record_url = Some(web_resource_record_url(
        environment,
        entity_logical_name,
        &component.object_id,
    ));
    component.layer_name = component
        .logical_name
        .clone()
        .or_else(|| component.schema_name.clone())
        .or_else(|| Some(component.display_name.clone()));
}

pub(super) async fn enrich_solution_component(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    component: &mut SolutionComponentSummary,
) {
    match component.component_type {
    1 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/EntityDefinitions({})", component.object_id),
        &[(
          "$select",
          "MetadataId,LogicalName,SchemaName,DisplayName,IsManaged,ModifiedOn",
        )],
      )
      .await
      {
        apply_table_detail(component, &value);
      }
    }
    9 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/GlobalOptionSetDefinitions({})", component.object_id),
        &[("$select", "MetadataId,Name,DisplayName,IsManaged")],
      )
      .await
      {
        apply_choice_detail(component, &value);
      }
    }
    20 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/roles({})", component.object_id),
        &[("$select", "roleid,name,ismanaged,modifiedon")],
      )
      .await
      {
        apply_table_row_detail(
          component,
          &value,
          &["name"],
          &["name"],
          &[],
          "role",
          environment,
        );
      }
    }
    24 | 60 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/systemforms({})", component.object_id),
        &[("$select", "formid,name,objecttypecode,type,ismanaged,modifiedon")],
      )
      .await
      {
        apply_table_row_detail(
          component,
          &value,
          &["name"],
          &["objecttypecode"],
          &[],
          "systemform",
          environment,
        );
      }
    }
    26 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/savedqueries({})", component.object_id),
        &[("$select", "savedqueryid,name,returnedtypecode,ismanaged,modifiedon")],
      )
      .await
      {
        apply_table_row_detail(
          component,
          &value,
          &["name"],
          &["returnedtypecode"],
          &[],
          "savedquery",
          environment,
        );
      }
    }
    29 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/workflows({})", component.object_id),
        &[("$select", "workflowid,name,uniquename,ismanaged,modifiedon")],
      )
      .await
      {
        apply_table_row_detail(
          component,
          &value,
          &["name"],
          &["uniquename"],
          &[],
          "workflow",
          environment,
        );
      }
    }
    61 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/webresourceset({})", component.object_id),
        &[(
          "$select",
          "webresourceid,name,displayname,webresourcetype,ismanaged,createdon,modifiedon",
        )],
      )
      .await
      {
        apply_table_row_detail(
          component,
          &value,
          &["displayname", "name"],
          &["name"],
          &["name"],
          "webresource",
          environment,
        );
      }
    }
    300 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/canvasapps({})", component.object_id),
        &[("$select", "canvasappid,displayname,name,modifiedon")],
      )
      .await
      {
        apply_table_row_detail(
          component,
          &value,
          &["displayname", "name"],
          &["name"],
          &[],
          "canvasapp",
          environment,
        );
      }
    }
    380 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/environmentvariabledefinitions({})", component.object_id),
        &[(
          "$select",
          "environmentvariabledefinitionid,schemaname,displayname,ismanaged,modifiedon",
        )],
      )
      .await
      {
        apply_table_row_detail(
          component,
          &value,
          &["displayname", "schemaname"],
          &["schemaname"],
          &["schemaname"],
          "environmentvariabledefinition",
          environment,
        );
      }
    }
    381 => {
      if let Some(value) = optional_dataverse_get_json_value(
        app,
        environment,
        &format!("/environmentvariablevalues({})", component.object_id),
        &[(
          "$select",
          "environmentvariablevalueid,value,_environmentvariabledefinitionid_value,modifiedon",
        )],
      )
      .await
      {
        apply_table_row_detail(
          component,
          &value,
          &["value"],
          &["_environmentvariabledefinitionid_value"],
          &[],
          "environmentvariablevalue",
          environment,
        );
      }
    }
    _ => {}
  }
}

pub(super) fn dependency_item_from_value(value: &Value) -> Option<SolutionDependencyItem> {
    let dependent_component_type = json_i32(value, "dependentcomponenttype").unwrap_or_default();
    let required_component_type = json_i32(value, "requiredcomponenttype").unwrap_or_default();
    let dependency_type = json_i32(value, "dependencytype").unwrap_or_default();

    Some(SolutionDependencyItem {
        id: json_string(value, "dependencyid")?,
        dependency_type,
        dependency_type_label: dependency_type_label(dependency_type).to_string(),
        dependent_component_type,
        dependent_component_type_label: solution_component_type_label(dependent_component_type)
            .to_string(),
        dependent_component_object_id: json_string(value, "dependentcomponentobjectid")?,
        dependent_component_parent_id: json_string(value, "dependentcomponentparentid"),
        required_component_type,
        required_component_type_label: solution_component_type_label(required_component_type)
            .to_string(),
        required_component_object_id: json_string(value, "requiredcomponentobjectid")?,
        required_component_parent_id: json_string(value, "requiredcomponentparentid"),
    })
}

pub(super) async fn dependency_function_items(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    function_name: &str,
    object_id: &str,
    component_type: i32,
) -> Result<Vec<SolutionDependencyItem>, String> {
    let path = format!(
    "/{function_name}(ObjectId=@ObjectId,ComponentType=@ComponentType)?@ObjectId={object_id}&@ComponentType={component_type}"
  );
    let response = dataverse_get_json_value(app, environment, &path, &[]).await?;

    Ok(response
        .get("value")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(dependency_item_from_value)
                .collect()
        })
        .unwrap_or_default())
}
pub(super) fn solution_layer_from_value(value: &Value) -> Option<SolutionLayer> {
    Some(SolutionLayer {
        id: json_string(value, "msdyn_componentlayerid")?,
        name: json_string(value, "msdyn_name").unwrap_or_else(|| "Layer".to_string()),
        component_name: json_string(value, "msdyn_solutioncomponentname"),
        solution_name: json_string(value, "msdyn_solutionname"),
        publisher_name: json_string(value, "msdyn_publishername"),
        order: json_i32(value, "msdyn_order"),
        overwrite_time: json_string(value, "msdyn_overwritetime"),
        changes: json_string(value, "msdyn_changes"),
    })
}
#[tauri::command]
pub(super) async fn list_solutions(
    app: AppHandle,
    environment: DataverseEnvironment,
    managed_filter: Option<String>,
) -> Result<Vec<SolutionSummary>, String> {
    let filter = solution_managed_filter(managed_filter.as_deref())?;
    let values = dataverse_get_collection_values(
    &app,
    &environment,
    "/solutions",
    vec![
      (
        "$select".to_string(),
        "solutionid,uniquename,friendlyname,version,ismanaged,isvisible,createdon,modifiedon,_publisherid_value".to_string(),
      ),
      ("$filter".to_string(), filter.to_string()),
      ("$expand".to_string(), "publisherid($select=publisherid,uniquename,friendlyname,customizationprefix)".to_string()),
      ("$orderby".to_string(), "createdon desc".to_string()),
    ],
  )
  .await?;

    Ok(values
        .iter()
        .map(|value| solution_from_value(value, None))
        .collect())
}

#[tauri::command]
pub(super) async fn list_solution_components(
    app: AppHandle,
    environment: DataverseEnvironment,
    solution_id: String,
) -> Result<Vec<SolutionComponentSummary>, String> {
    let values = solution_component_values(&app, &environment, &solution_id).await?;
    let mut components = Vec::new();

    for value in values {
        if let Some(mut component) = solution_component_from_value(&value) {
            enrich_solution_component(&app, &environment, &mut component).await;
            components.push(component);
        }
    }

    components.sort_by(|left, right| {
        left.group
            .cmp(&right.group)
            .then_with(|| {
                left.display_name
                    .to_lowercase()
                    .cmp(&right.display_name.to_lowercase())
            })
            .then_with(|| left.object_id.cmp(&right.object_id))
    });

    Ok(components)
}

#[tauri::command]
pub(super) async fn get_solution_component_dependencies(
    app: AppHandle,
    environment: DataverseEnvironment,
    object_id: String,
    component_type: i32,
) -> Result<SolutionDependencyReport, String> {
    let required = dependency_function_items(
        &app,
        &environment,
        "RetrieveRequiredComponents",
        &object_id,
        component_type,
    )
    .await?;
    let dependents = dependency_function_items(
        &app,
        &environment,
        "RetrieveDependentComponents",
        &object_id,
        component_type,
    )
    .await?;
    let delete_blockers = dependency_function_items(
        &app,
        &environment,
        "RetrieveDependenciesForDelete",
        &object_id,
        component_type,
    )
    .await?;

    Ok(SolutionDependencyReport {
        required,
        dependents,
        delete_blockers,
    })
}

#[tauri::command]
pub(super) async fn get_solution_component_layers(
    app: AppHandle,
    environment: DataverseEnvironment,
    object_id: String,
    component_name: String,
) -> Result<Vec<SolutionLayer>, String> {
    let trimmed_name = component_name.trim();
    if trimmed_name.is_empty() {
        return Ok(Vec::new());
    }

    let filter = format!(
        "msdyn_componentid eq '{}' and msdyn_solutioncomponentname eq '{}'",
        odata_string_literal(&object_id),
        odata_string_literal(trimmed_name)
    );
    let values = dataverse_get_collection_values(
    &app,
    &environment,
    "/msdyn_componentlayers",
    vec![
      (
        "$select".to_string(),
        "msdyn_componentlayerid,msdyn_name,msdyn_componentid,msdyn_solutioncomponentname,msdyn_solutionname,msdyn_publishername,msdyn_order,msdyn_overwritetime,msdyn_changes".to_string(),
      ),
      ("$filter".to_string(), filter),
      ("$orderby".to_string(), "msdyn_order desc".to_string()),
    ],
  )
  .await?;

    Ok(values
        .iter()
        .filter_map(solution_layer_from_value)
        .collect())
}

#[tauri::command]
pub(super) async fn list_solution_web_resource_candidates(
    app: AppHandle,
    environment: DataverseEnvironment,
    solution_id: String,
) -> Result<Vec<SolutionWebResourceCandidate>, String> {
    let component_values = solution_component_values(&app, &environment, &solution_id).await?;
    let solution_web_resource_ids = component_values
        .iter()
        .filter(|value| json_i32(value, "componenttype") == Some(61))
        .filter_map(|value| json_string(value, "objectid"))
        .collect::<HashSet<_>>();

    let values = dataverse_get_collection_values(
    &app,
    &environment,
    "/webresourceset",
    vec![
      (
        "$select".to_string(),
        "webresourceid,name,displayname,webresourcetype,ismanaged,modifiedon".to_string(),
      ),
      (
        "$filter".to_string(),
        "ismanaged eq false and (webresourcetype eq 1 or webresourcetype eq 2 or webresourcetype eq 3 or webresourcetype eq 4 or webresourcetype eq 11 or webresourcetype eq 12)".to_string(),
      ),
      ("$orderby".to_string(), "name asc".to_string()),
    ],
  )
  .await?;

    Ok(values
        .iter()
        .filter_map(|value| {
            let id = json_string(value, "webresourceid")?;
            let type_code = json_i32(value, "webresourcetype").unwrap_or(4);

            let name = json_string(value, "name").unwrap_or_default();
            if is_microsoft_web_resource_name(&name) {
                return None;
            }

            Some(SolutionWebResourceCandidate {
                in_solution: solution_web_resource_ids.contains(&id),
                id,
                name,
                display_name: json_string(value, "displayname"),
                resource_type: map_resource_type(Some(type_code)),
                type_code,
                is_managed: false,
                modified_on: json_string(value, "modifiedon"),
            })
        })
        .collect())
}

#[tauri::command]
pub(super) async fn add_existing_web_resource_to_solution(
    app: AppHandle,
    environment: DataverseEnvironment,
    solution_unique_name: String,
    web_resource_id: String,
) -> Result<SolutionWriteResult, String> {
    let solution_unique_name = validate_logical_name(&solution_unique_name)?;
    let resource = dataverse_get_json_value(
        &app,
        &environment,
        &format!("/webresourceset({web_resource_id})"),
        &[("$select", "webresourceid,name,ismanaged")],
    )
    .await?;
    let resource_name = json_string(&resource, "name").unwrap_or_default();

    if json_bool(&resource, "ismanaged").unwrap_or(false) {
        return Err("Managed web resources cannot be added from Solution Explorer.".to_string());
    }

    if is_microsoft_web_resource_name(&resource_name) {
        return Err("Microsoft web resources cannot be added from Solution Explorer.".to_string());
    }

    dataverse_json_request(
        &app,
        &environment,
        reqwest::Method::POST,
        "/AddSolutionComponent",
        &serde_json::json!({
          "ComponentId": web_resource_id,
          "ComponentType": 61,
          "SolutionUniqueName": solution_unique_name,
          "AddRequiredComponents": false,
          "DoNotIncludeSubcomponents": true
        }),
    )
    .await?;

    Ok(SolutionWriteResult {
        web_resource_id: Some(web_resource_id),
        message: format!("Added web resource to {solution_unique_name}"),
    })
}

#[tauri::command]
pub(super) async fn create_web_resource_in_solution(
    app: AppHandle,
    environment: DataverseEnvironment,
    input: CreateWebResourceInput,
) -> Result<SolutionWriteResult, String> {
    let solution_unique_name = validate_logical_name(&input.solution_unique_name)?;
    let name = input.name.trim();
    if name.is_empty() {
        return Err("Web resource name is required.".to_string());
    }

    if name.len() > 256 {
        return Err("Web resource name must be 256 characters or fewer.".to_string());
    }

    let type_code = resource_type_code(&input.resource_type)?;
    let display_name = input.display_name.trim();
    let description = input.description.trim();
    let content = BASE64.encode(input.content.as_bytes());
    let mut payload = serde_json::json!({
      "name": name,
      "webresourcetype": type_code,
      "content": content,
    });

    if !display_name.is_empty() {
        payload["displayname"] = Value::String(display_name.to_string());
    }

    if !description.is_empty() {
        payload["description"] = Value::String(description.to_string());
    }

    let (body, entity_id) = dataverse_post_json_with_headers(
        &app,
        &environment,
        "/webresourceset",
        &payload,
        &[
            ("MSCRM.SolutionUniqueName", solution_unique_name.clone()),
            ("Prefer", "return=representation".to_string()),
        ],
    )
    .await?;
    let web_resource_id = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|value| json_string(&value, "webresourceid"))
        .or_else(|| entity_id.as_deref().and_then(guid_from_entity_id));

    Ok(SolutionWriteResult {
        web_resource_id,
        message: format!("Created {name} in {solution_unique_name}"),
    })
}
