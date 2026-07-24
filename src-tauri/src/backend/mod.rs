mod ai;
mod auth;
mod dataverse;
mod fetchxml;
mod form_logic;
mod plugins;
mod solutions;
mod storage;
mod web_resources;

pub(crate) fn run() {
    tauri::Builder::default()
        .manage(auth::PendingAuthState::default())
        .manage(ai::AiChatState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            storage::load_config,
            storage::save_config,
            storage::load_user_settings,
            storage::save_user_settings,
            storage::delete_environment_token,
            auth::start_browser_auth,
            auth::complete_browser_auth,
            auth::check_dataverse_connection,
            web_resources::list_web_resources,
            web_resources::list_web_resource_activity,
            web_resources::get_web_resource_content,
            web_resources::download_web_resources,
            web_resources::delete_web_resources,
            web_resources::save_web_resource_content,
            web_resources::publish_web_resource,
            solutions::list_solutions,
            solutions::list_solution_components,
            solutions::get_solution_component_dependencies,
            solutions::get_solution_component_layers,
            solutions::list_solution_web_resource_candidates,
            solutions::add_existing_web_resource_to_solution,
            solutions::remove_solution_component_from_solution,
            solutions::create_web_resource_in_solution,
            solutions::import_web_resources_in_solution,
            plugins::inspect_plugin_assembly,
            plugins::list_plugin_assemblies,
            plugins::list_plugin_packages,
            plugins::list_plugin_types,
            plugins::list_plugin_steps,
            plugins::list_plugin_step_images,
            plugins::list_plugin_messages,
            plugins::list_plugin_message_filters,
            plugins::list_plugin_filtering_attributes,
            plugins::list_plugin_service_endpoints,
            plugins::list_plugin_system_users,
            plugins::get_plugin_registration_snapshot,
            plugins::register_plugin_assembly,
            plugins::update_plugin_assembly,
            plugins::unregister_plugin_assembly,
            plugins::create_plugin_type,
            plugins::unregister_plugin_type,
            plugins::register_plugin_step,
            plugins::set_plugin_step_state,
            plugins::set_plugin_component_state,
            plugins::unregister_plugin_step,
            plugins::register_plugin_step_image,
            plugins::unregister_plugin_step_image,
            plugins::register_plugin_service_endpoint,
            plugins::unregister_plugin_service_endpoint,
            plugins::get_plugin_component_dependencies,
            plugins::export_plugin_registration,
            ai::list_ai_chat_threads,
            ai::load_ai_chat_thread,
            ai::rename_ai_chat_thread,
            ai::delete_ai_chat_thread,
            ai::start_ai_chat_thread,
            ai::prepare_ai_chat_attachments,
            ai::save_pasted_ai_chat_image,
            ai::send_ai_chat_message,
            form_logic::list_form_logic_entities,
            form_logic::list_form_logic_forms,
            form_logic::get_form_logic_form_context,
            fetchxml::list_fetchxml_entities,
            fetchxml::get_fetchxml_entity_metadata,
            fetchxml::execute_fetchxml_query
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
