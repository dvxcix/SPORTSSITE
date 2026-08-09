use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

const PRODUCTION_ORIGIN: &str = "https://www.slipsurge.com";

fn app_url() -> url::Url {
    let default_origin = if cfg!(debug_assertions) {
        "http://localhost:3000"
    } else {
        PRODUCTION_ORIGIN
    };
    let origin = option_env!("SLIPSURGE_DESKTOP_ORIGIN").unwrap_or(default_origin);
    format!("{}/feed?platform=desktop", origin.trim_end_matches('/'))
        .parse()
        .expect("SLIPSURGE_DESKTOP_ORIGIN must be a valid http(s) origin")
}

fn desktop_complete_url(deep_link: &url::Url) -> Option<url::Url> {
    if deep_link.scheme() != "slipsurge"
        || deep_link.host_str() != Some("auth")
        || deep_link.path() != "/complete"
    {
        return None;
    }

    let mut target = app_url();
    target.set_path("/auth/desktop/complete");
    target.set_query(deep_link.query());
    Some(target)
}

fn handle_deep_links(app: &tauri::AppHandle, urls: Vec<url::Url>) {
    let Some(target) = urls.iter().find_map(desktop_complete_url) else {
        return;
    };

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.navigate(target);
        let _ = window.show();
        let _ = window.set_focus();
    }
}

async fn check_for_updates(app: tauri::AppHandle) {
    let update = match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(update) => update,
            Err(error) => {
                eprintln!("SlipSurge update check failed: {error}");
                return;
            }
        },
        Err(error) => {
            eprintln!("SlipSurge updater unavailable: {error}");
            return;
        }
    };

    let Some(update) = update else {
        return;
    };

    let notes = update
        .body
        .as_deref()
        .unwrap_or("Performance improvements and fixes.");
    let should_install = app
        .dialog()
        .message(format!(
            "SlipSurge {} is ready.\n\n{}\n\nInstall and restart now?",
            update.version, notes
        ))
        .title("SlipSurge Update Available")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Update now".into(),
            "Later".into(),
        ))
        .blocking_show();

    if !should_install {
        return;
    }

    if let Err(error) = update.download_and_install(|_, _| {}, || {}).await {
        eprintln!("SlipSurge update installation failed: {error}");
        app.dialog()
            .message(
                "The update could not be installed. SlipSurge will try again next time it starts.",
            )
            .title("Update Failed")
            .blocking_show();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            app.deep_link().register_all()?;

            let app_handle = app.handle().clone();
            let allowed_origin = app_url().origin().ascii_serialization();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(app_url()))
                .title("SlipSurge")
                .inner_size(1440.0, 960.0)
                .min_inner_size(1080.0, 700.0)
                .resizable(true)
                .user_agent("SlipSurgeDesktop/0.1")
                .on_navigation(move |url| {
                    let is_allowed_origin = url.origin().ascii_serialization() == allowed_origin;
                    if is_allowed_origin {
                        if url.path() == "/auth/desktop/start" {
                            let _ = app_handle.opener().open_url(url.as_str(), None::<&str>);
                            return false;
                        }
                        return true;
                    }
                    if matches!(url.scheme(), "http" | "https") {
                        let _ = app_handle.opener().open_url(url.as_str(), None::<&str>);
                    }
                    false
                })
                .build()?;

            let deep_link_app = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                handle_deep_links(&deep_link_app, event.urls());
            });

            if let Some(urls) = app.deep_link().get_current()? {
                handle_deep_links(app.handle(), urls);
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }

            #[cfg(desktop)]
            {
                let updater_app = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    check_for_updates(updater_app).await;
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running SlipSurge desktop");
}
