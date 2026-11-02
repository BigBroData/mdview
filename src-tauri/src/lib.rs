//! mdview desktop shell (Tauri 2).
//!
//! The webview runs the same client as the browser stage (`dist/`). This
//! crate only does what a browser page cannot: read a file by path, watch it,
//! serve images next to it, open a native file dialog, and take the file to
//! open from the command line (which is how GNOME passes a double-clicked file).

mod assets;
mod save;
mod themes;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::http::{header, Response, StatusCode};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

/// Sent to the frontend when the file on disk changes.
const DOCUMENT_CHANGED: &str = "document-changed";

/// Sent when another `mdview file.md` was started: this window takes the file(s) as tabs.
const OPEN_REQUEST: &str = "open-request";

/// Sent when the user tried to close the window while a document has unsaved changes.
const CLOSE_REQUESTED: &str = "close-requested";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPayload {
    path: String,
    name: String,
    text: String,
    /// The editor may change this file: valid UTF-8, writable, a Markdown or text name.
    editable: bool,
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
    /// Some tab has unsaved changes: closing the window must ask first.
    dirty: AtomicBool,
}

/// Reads a document as UTF-8, replacing invalid bytes instead of failing; also says
/// whether the editor may touch the file.
fn read_lossy(path: &Path) -> Result<(String, bool), String> {
    let bytes = std::fs::read(path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    let readonly = std::fs::metadata(path)
        .map(|m| m.permissions().readonly())
        .unwrap_or(true);
    let editable = save::can_edit(path, &bytes, readonly);
    let text = String::from_utf8_lossy(&bytes).into_owned();
    let text = match text.strip_prefix('\u{feff}') {
        Some(without_bom) => without_bom.to_owned(),
        None => text,
    };
    Ok((text, editable))
}

fn payload_for(path: &Path) -> Result<DocumentPayload, String> {
    let (text, editable) = read_lossy(path)?;
    Ok(DocumentPayload {
        path: path.display().to_string(),
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        text,
        editable,
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

/// Writes the editor's text over the document. Only an existing Markdown or text
/// file is accepted (see `save.rs`); the page decides when to call it (Ctrl+S).
#[tauri::command]
fn save_document(path: String, text: String) -> Result<(), String> {
    save::write_document(Path::new(&path), &text)
}

/// The page tells the shell whether any tab has unsaved changes (the window then
/// asks before closing) and whether the shown one has (a dot in the title).
#[tauri::command]
fn report_dirty(app: AppHandle, state: State<'_, AppState>, any: bool, shown: bool) {
    state.dirty.store(any, Ordering::SeqCst);
    let name = state
        .current
        .lock()
        .ok()
        .and_then(|guard| {
            guard
                .as_ref()
                .and_then(|c| c.path.file_name().map(|n| n.to_string_lossy().into_owned()))
        })
        .unwrap_or_default();
    set_window_title(&app, &if shown { format!("● {name}") } else { name });
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

/// Files named on a command line, made absolute against the folder the command ran in.
/// The first element of `args` is the program itself; options are skipped.
fn document_args(args: &[String], cwd: &Path) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        .map(|arg| {
            let path = Path::new(arg);
            if path.is_absolute() {
                arg.clone()
            } else {
                cwd.join(path).display().to_string()
            }
        })
        .collect()
}

fn startup_args() -> Vec<String> {
    let args: Vec<String> = std::env::args().collect();
    let cwd = std::env::current_dir().unwrap_or_default();
    document_args(&args, &cwd)
}

/// The first file given on the command line (`mdview file.md`, or a double-click in
/// the file manager via the `.desktop` entry), if any.
#[tauri::command]
fn initial_document(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<DocumentPayload>, String> {
    let Some(first) = startup_args().into_iter().next() else {
        return Ok(None);
    };
    open_document(app, state, first).map(Some)
}

/// Further files from the same command line (a multi-selection in the file manager); they
/// open as more tabs.
#[tauri::command]
fn extra_documents() -> Vec<String> {
    startup_args().into_iter().skip(1).collect()
}

/// Closes the window (the last tab was closed); the app ends with it.
#[tauri::command]
fn close_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.close();
    }
}

/// Only web and mail links may be handed to the system; a document must not be
/// able to start arbitrary programs or open `file:` URLs through a link.
fn is_openable_link(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    ["http://", "https://", "mailto:"]
        .iter()
        .any(|scheme| lower.starts_with(scheme))
}

/// Shows a link of the document in the user's default browser or mail client.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let url = url.trim().to_owned();
    if !is_openable_link(&url) {
        return Err(format!("refusing to open {url}"));
    }
    #[cfg(target_os = "linux")]
    let mut command = std::process::Command::new("xdg-open");
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut c = std::process::Command::new("rundll32");
        c.arg("url.dll,FileProtocolHandler");
        c
    };
    let mut child = command
        .arg(&url)
        .spawn()
        .map_err(|e| format!("cannot open {url}: {e}"))?;
    // Reap the helper so it does not linger as a zombie.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // First plugin, so a second launch is caught before anything else starts: it hands its
        // files to the running window as tabs and exits.
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let paths = document_args(&args, Path::new(&cwd));
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            if !paths.is_empty() {
                let _ = app.emit(OPEN_REQUEST, paths);
            }
        }))
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
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<AppState>().dirty.load(Ordering::SeqCst) {
                    // The page asks Save / Discard / Cancel, then clears the flag and closes.
                    api.prevent_close();
                    let _ = window.emit(CLOSE_REQUESTED, ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            save_document,
            report_dirty,
            open_document,
            read_document,
            initial_document,
            extra_documents,
            close_window,
            open_external,
            themes::list_themes
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

#[cfg(test)]
mod tests {
    use super::{document_args, is_openable_link};
    use std::path::Path;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn command_line_files_become_absolute_paths() {
        let cwd = Path::new("/home/u/docs");
        assert_eq!(
            document_args(&args(&["mdview", "a.md", "/tmp/b.md", "sub/c.mdx"]), cwd),
            ["/home/u/docs/a.md", "/tmp/b.md", "/home/u/docs/sub/c.mdx"]
        );
    }

    #[test]
    fn the_program_name_and_options_are_not_files() {
        let cwd = Path::new("/x");
        assert!(document_args(&args(&["mdview"]), cwd).is_empty());
        assert_eq!(document_args(&args(&["mdview", "--foo", "a.md"]), cwd), ["/x/a.md"]);
    }

    #[test]
    fn web_and_mail_links_are_allowed() {
        assert!(is_openable_link("https://example.com/a?b=c#d"));
        assert!(is_openable_link("HTTP://example.com"));
        assert!(is_openable_link("mailto:someone@example.com"));
    }

    #[test]
    fn everything_else_is_refused() {
        assert!(!is_openable_link("file:///etc/passwd"));
        assert!(!is_openable_link("javascript:alert(1)"));
        assert!(!is_openable_link("--help"));
        assert!(!is_openable_link("/usr/bin/true"));
        assert!(!is_openable_link(""));
    }
}
