//! Serving files that sit next to the document (images) to the webview.
//!
//! The frontend rewrites relative image paths to `mdasset://localhost/<path>`
//! (Linux/macOS) or `http://mdasset.localhost/<path>` (Windows). This module
//! maps that path back to a file and refuses anything outside the document's
//! folder. It mirrors `src/server/paths.ts` of the browser stage.

use std::path::{Component, Path, PathBuf};

use percent_encoding::percent_decode_str;

/// Resolves a URL path against `root`. Returns `None` when the path is
/// malformed, absolute, or escapes `root`.
pub fn resolve_asset(root: &Path, url_path: &str) -> Option<PathBuf> {
    let decoded = percent_decode_str(url_path).decode_utf8().ok()?;
    if decoded.contains('\0') {
        return None;
    }
    let relative = Path::new(decoded.trim_start_matches('/'));
    if relative.as_os_str().is_empty() {
        return None;
    }

    // Walk the components ourselves: no `..`, no roots, no drive prefixes.
    let mut target = root.to_path_buf();
    for component in relative.components() {
        match component {
            Component::Normal(part) => target.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }

    // Symlinks could still point outside; canonicalize and re-check.
    let canonical_root = root.canonicalize().ok()?;
    let canonical = target.canonicalize().ok()?;
    if !canonical.starts_with(&canonical_root) || canonical == canonical_root {
        return None;
    }
    Some(canonical)
}

/// Content type by file extension; unknown types are served as octet-stream.
pub fn content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        Some("webp") => "image/webp",
        Some("avif") => "image/avif",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        Some("css") => "text/css; charset=utf-8",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("md") => "text/markdown; charset=utf-8",
        Some("txt") => "text/plain; charset=utf-8",
        Some("pdf") => "application/pdf",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn sandbox() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mdview-assets-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("doc/img")).unwrap();
        fs::write(dir.join("doc/img/a.png"), b"PNG").unwrap();
        fs::write(dir.join("doc/img/a b.png"), b"PNG").unwrap();
        fs::write(dir.join("secret.txt"), b"secret").unwrap();
        dir
    }

    #[test]
    fn serves_files_inside_the_document_folder() {
        let dir = sandbox();
        let root = dir.join("doc");
        assert!(resolve_asset(&root, "/img/a.png").is_some());
        assert!(resolve_asset(&root, "img/a.png").is_some());
        assert!(resolve_asset(&root, "/img/a%20b.png").is_some());
        assert!(resolve_asset(&root, "/./img/a.png").is_some());
    }

    #[test]
    fn refuses_everything_outside() {
        let dir = sandbox();
        let root = dir.join("doc");
        for bad in [
            "/../secret.txt",
            "/img/../../secret.txt",
            "/%2e%2e/secret.txt",
            "/..%2fsecret.txt",
            "/",
            "",
            "/.",
            "/a%00.png",
            "/%E0%A4%A",
            "/img/missing.png",
        ] {
            assert!(resolve_asset(&root, bad).is_none(), "should refuse {bad}");
        }
        #[cfg(windows)]
        assert!(resolve_asset(&root, "/C:/Windows/win.ini").is_none());
        #[cfg(unix)]
        assert!(resolve_asset(&root, "//etc/passwd").is_none());
    }

    #[test]
    fn content_types() {
        assert_eq!(content_type(Path::new("x.PNG")), "image/png");
        assert_eq!(content_type(Path::new("x.svg")), "image/svg+xml");
        assert_eq!(content_type(Path::new("x.unknown")), "application/octet-stream");
        assert_eq!(content_type(Path::new("noext")), "application/octet-stream");
    }
}
