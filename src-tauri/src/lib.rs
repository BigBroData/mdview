//! mdview desktop shell (Tauri 2).
//!
//! The webview runs the same client as the browser stage (`dist/`). This
//! crate only does what a browser page cannot: read a file by path, watch it,
//! serve images next to it, open a native file dialog, and take the file to
//! open from the command line (which is how GNOME passes a double-clicked file).

mod assets;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::http::{header, Response, StatusCode};
use tauri::{AppHandle, Emitter, Manager, State};

/// Sent to the frontend when the file on disk changes.
const DOCUMENT_CHANGED: &str = "document-changed";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPayload {
    path: String,
    name: String,
    text: String,
}

struct CurrentDocument {
    path: PathBuf,
    dir: PathBuf,
    /// Kept alive for as long as the document is open; dropping it stops watching.
    _watcher: RecommendedWatcher,
}

#[derive(Default)]
pub struct AppState {
    current: Mutex<Option<CurrentDocument>>,
}

/// Reads a document as UTF-8, replacing invalid bytes instead of failing.
fn read_lossy(path: &Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    let text = String::from_utf8_lossy(&bytes).into_owned();
    Ok(match text.strip_prefix('\u{feff}') {
        Some(without_bom) => without_bom.to_owned(),
        None => text,
    })
}

fn payload_for(path: &Path) -> Result<DocumentPayload, String> {
    Ok(DocumentPayload {
        path: path.display().to_string(),
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        text: read_lossy(path)?,
    })
}

/// Watches the document's *folder* (editors such as gedit save by writing a
/// temp file and renaming it over the original, which blinds a file watcher)
/// and emits `document-changed` for events that concern the file.
fn watch(app: AppHandle, path: &Path) -> Result<RecommendedWatcher, String> {
    let dir = path.parent().ok_or("document has no parent folder")?.to_path_buf();
    let name = path.file_name().map(|n| n.to_os_string());
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else { return };
        // Data changes name the file; renames, creates and removes may be the
        // temp-file half of an atomic save, so they always count. The page
        // drops reloads whose text did not change.
        let is_data_change = matches!(event.kind, notify::EventKind::Modify(notify::event::ModifyKind::Data(_)));
        let concerns_file = !is_data_change
            || event.paths.is_empty()
            || event
                .paths
                .iter()
                .any(|p| p.file_name().map(|n| n.to_os_string()) == name);
        if concerns_file {
            let _ = app.emit(DOCUMENT_CHANGED, ());
        }
    })
    .map_err(|e| format!("cannot create file watcher: {e}"))?;
    watcher
        .watch(&dir, RecursiveMode::NonRecursive)
        .map_err(|e| format!("cannot watch {}: {e}", dir.display()))?;
    Ok(watcher)
}

fn set_window_title(app: &AppHandle, name: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(&format!("{name} — mdview"));
    }
}

/// Opens a document: validates the path, starts watching it, returns its text.
#[tauri::command]
fn open_document(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<DocumentPayload, String> {
    let path = PathBuf::from(path)
        .canonicalize()
        .map_err(|e| format!("file not found: {e}"))?;
    if !path.is_file() {
        return Err(format!("not a file: {}", path.display()));
    }
    let payload = payload_for(&path)?;
    let watcher = watch(app.clone(), &path)?;
    let dir = path.parent().map(Path::to_path_buf).unwrap_or_default();
    *state.current.lock().map_err(|_| "state poisoned")? = Some(CurrentDocument {
        path,
        dir,
        _watcher: watcher,
    });
    set_window_title(&app, &payload.name);
    Ok(payload)
}

/// Re-reads the currently open document (after a `document-changed` event).
#[tauri::command]
fn read_document(state: State<'_, AppState>) -> Result<Option<DocumentPayload>, String> {
    let guard = state.current.lock().map_err(|_| "state poisoned")?;
    match guard.as_ref() {
        Some(current) => payload_for(&current.path).map(Some),
        None => Ok(None),
    }
}

/// The file given on the command line (`mdview file.md`, or a double-click in
/// the file manager via the `.desktop` entry), if any.
#[tauri::command]
fn initial_document(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<DocumentPayload>, String> {
    let Some(arg) = std::env::args().skip(1).find(|a| !a.starts_with('-')) else {
        return Ok(None);
    };
    open_document(app, state, arg).map(Some)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .register_uri_scheme_protocol("mdasset", |ctx, request| {
            let state = ctx.app_handle().state::<AppState>();
            let dir = state
                .current
                .lock()
                .ok()
                .and_then(|guard| guard.as_ref().map(|c| c.dir.clone()));
            let Some(dir) = dir else {
                return plain(StatusCode::NOT_FOUND, "no document open");
            };
            match assets::resolve_asset(&dir, request.uri().path()) {
                None => plain(StatusCode::FORBIDDEN, "outside the document folder"),
                Some(file) => match std::fs::read(&file) {
                    Ok(bytes) => Response::builder()
                        .status(StatusCode::OK)
                        .header(header::CONTENT_TYPE, assets::content_type(&file))
                        .header(header::CACHE_CONTROL, "no-cache")
                        .body(bytes)
                        .unwrap_or_else(|_| plain(StatusCode::INTERNAL_SERVER_ERROR, "response")),
                    Err(_) => plain(StatusCode::NOT_FOUND, "not found"),
                },
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_document,
            read_document,
            initial_document
        ])
        .run(tauri::generate_context!())
        .expect("error while running mdview");
}

fn plain(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(message.as_bytes().to_vec())
        .expect("static response")
}
