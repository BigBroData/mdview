//! Writing a document back to disk (the editor's Ctrl+S) and deciding whether
//! a file may be edited at all.
//!
//! Rules that keep the user's files safe:
//! - only an existing Markdown/text file is written, never a new path;
//! - a read-only file is refused;
//! - a file that is not valid UTF-8 is not editable, because the editor would
//!   save the replacement characters of the lossy read over the real bytes;
//! - an optional byte-order mark survives the round trip;
//! - the write goes to a temporary file that replaces the original (a crash
//!   leaves the old text), falling back to writing in place where the folder
//!   does not allow a new file. Symlinks are resolved first, so the link stays.

use std::path::{Path, PathBuf};

const BOM: [u8; 3] = [0xEF, 0xBB, 0xBF];

/// Extensions the editor will write; the same family the viewer opens, plus `.txt`.
const EDITABLE_EXTENSIONS: [&str; 5] = ["md", "markdown", "mdown", "mdx", "txt"];

pub fn is_editable_path(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| EDITABLE_EXTENSIONS.iter().any(|x| e.eq_ignore_ascii_case(x)))
}

/// The file's bytes can be edited and saved without changing anything the user did not touch.
pub fn can_edit(path: &Path, bytes: &[u8], readonly: bool) -> bool {
    !readonly && is_editable_path(path) && std::str::from_utf8(bytes).is_ok()
}

/// The bytes to store: the text, behind a byte-order mark if the file had one.
pub fn encode(text: &str, had_bom: bool) -> Vec<u8> {
    let mut out = Vec::with_capacity(text.len() + 3);
    if had_bom {
        out.extend_from_slice(&BOM);
    }
    out.extend_from_slice(text.as_bytes());
    out
}

fn replace_atomically(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let dir = path
        .parent()
        .ok_or_else(|| std::io::Error::other("no parent folder"))?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let temp: PathBuf = dir.join(format!(".{name}.mdview-save"));
    let result = (|| {
        std::fs::write(&temp, bytes)?;
        std::fs::set_permissions(&temp, std::fs::metadata(path)?.permissions())?;
        std::fs::rename(&temp, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result
}

pub fn write_document(path: &Path, text: &str) -> Result<(), String> {
    let path = path
        .canonicalize()
        .map_err(|e| format!("file not found: {e}"))?;
    let meta =
        std::fs::metadata(&path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    if !meta.is_file() {
        return Err(format!("not a file: {}", path.display()));
    }
    if !is_editable_path(&path) {
        return Err(format!(
            "refusing to write {}: not a Markdown or text file",
            path.display()
        ));
    }
    if meta.permissions().readonly() {
        return Err(format!("{} is read-only", path.display()));
    }
    let had_bom = std::fs::read(&path)
        .map(|b| b.starts_with(&BOM))
        .unwrap_or(false);
    let bytes = encode(text, had_bom);
    if replace_atomically(&path, &bytes).is_ok() {
        return Ok(());
    }
    std::fs::write(&path, &bytes).map_err(|e| format!("cannot write {}: {e}", path.display()))
}

/// The path of a file the user named in a save dialog: it must carry a Markdown or
/// text extension and live in a folder that exists. Returned with the folder made
/// canonical, so it compares equal to the paths the viewer opens documents by.
fn checked_target(path: &Path) -> Result<PathBuf, String> {
    if !is_editable_path(path) {
        return Err(format!(
            "{} must end in .md, .markdown, .mdown, .mdx or .txt",
            path.display()
        ));
    }
    let name = path
        .file_name()
        .ok_or_else(|| format!("no file name in {}", path.display()))?;
    let folder = match path.parent() {
        Some(p) if !p.as_os_str().is_empty() => p,
        _ => Path::new("."),
    };
    let folder = folder
        .canonicalize()
        .map_err(|e| format!("folder not found: {e}"))?;
    if !folder.is_dir() {
        return Err(format!("not a folder: {}", folder.display()));
    }
    Ok(folder.join(name))
}

fn create_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    // `create_new` fails if anything is there, a dangling symlink included.
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                format!("{} already exists", path.display())
            } else {
                format!("cannot create {}: {e}", path.display())
            }
        })?;
    file.write_all(bytes)
        .map_err(|e| format!("cannot write {}: {e}", path.display()))
}

/// "New file": makes an empty file that must not exist yet; returns its path.
pub fn create_document(path: &Path) -> Result<PathBuf, String> {
    let target = checked_target(path)?;
    create_new(&target, b"")?;
    Ok(target)
}

/// "Save as": writes the text to the named file, creating it. An existing file is
/// replaced only by the same rules as an ordinary save (writable, Markdown or text);
/// the save dialog has already asked the user whether to replace it.
pub fn write_document_as(path: &Path, text: &str) -> Result<PathBuf, String> {
    let target = checked_target(path)?;
    if std::fs::symlink_metadata(&target).is_ok() {
        write_document(&target, text)?;
        return target
            .canonicalize()
            .map_err(|e| format!("file not found: {e}"));
    }
    create_new(&target, &encode(text, false))?;
    Ok(target)
}

/// "Save a copy" from reading mode: the bytes of `from` under a new name, exactly as they
/// are (a file that is read-only or not UTF-8 can be copied, only the text editor cannot
/// write it). An existing target is replaced by the same rules as any save, and never
/// the source itself.
pub fn copy_document(from: &Path, to: &Path) -> Result<PathBuf, String> {
    let source = from
        .canonicalize()
        .map_err(|e| format!("file not found: {e}"))?;
    if !source.is_file() {
        return Err(format!("not a file: {}", source.display()));
    }
    let target = checked_target(to)?;
    let bytes =
        std::fs::read(&source).map_err(|e| format!("cannot read {}: {e}", source.display()))?;
    if std::fs::symlink_metadata(&target).is_err() {
        create_new(&target, &bytes)?;
        return Ok(target);
    }
    let target = target
        .canonicalize()
        .map_err(|e| format!("file not found: {e}"))?;
    if target == source {
        return Err("that is the same file".to_owned());
    }
    let meta = std::fs::metadata(&target)
        .map_err(|e| format!("cannot read {}: {e}", target.display()))?;
    if !meta.is_file() {
        return Err(format!("not a file: {}", target.display()));
    }
    if meta.permissions().readonly() {
        return Err(format!("{} is read-only", target.display()));
    }
    if replace_atomically(&target, &bytes).is_err() {
        std::fs::write(&target, &bytes)
            .map_err(|e| format!("cannot write {}: {e}", target.display()))?;
    }
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mdview-save-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn only_markdown_and_text_paths_are_editable() {
        assert!(is_editable_path(Path::new("/a/b.md")));
        assert!(is_editable_path(Path::new("/a/b.MDX")));
        assert!(is_editable_path(Path::new("/a/b.txt")));
        assert!(!is_editable_path(Path::new("/a/b.rs")));
        assert!(!is_editable_path(Path::new("/etc/passwd")));
    }

    #[test]
    fn invalid_utf8_and_read_only_files_are_not_editable() {
        let p = Path::new("/a/b.md");
        assert!(can_edit(p, "привет".as_bytes(), false));
        assert!(!can_edit(p, &[0xff, 0xfe, 0x41], false));
        assert!(!can_edit(p, b"text", true));
    }

    #[test]
    fn bom_is_kept_only_if_the_file_had_one() {
        assert_eq!(encode("a", false), b"a");
        assert_eq!(encode("a", true), [0xEF, 0xBB, 0xBF, b'a']);
    }

    #[test]
    fn a_new_file_is_created_empty_and_never_replaces_one() {
        let dir = scratch("create");
        let file = dir.join("fresh.md");
        let made = create_document(&file).unwrap();
        assert_eq!(made, dir.canonicalize().unwrap().join("fresh.md"));
        assert_eq!(std::fs::read(&file).unwrap(), b"");

        std::fs::write(&file, "keep me").unwrap();
        assert!(create_document(&file).unwrap_err().contains("already exists"));
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "keep me");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn new_files_need_a_markdown_name_and_an_existing_folder() {
        let dir = scratch("names");
        assert!(create_document(&dir.join("notes.rs")).is_err());
        assert!(create_document(&dir.join("notes")).is_err());
        assert!(create_document(&dir.join("no-such-folder").join("a.md")).is_err());
        assert!(write_document_as(&dir.join("script.sh"), "x").is_err());
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_as_creates_a_file_and_replaces_an_existing_one_by_the_ordinary_rules() {
        let dir = scratch("saveas");
        let copy = dir.join("copy.md");
        write_document_as(&copy, "# one\n").unwrap();
        assert_eq!(std::fs::read(&copy).unwrap(), b"# one\n");

        std::fs::write(&copy, [&BOM[..], b"old"].concat()).unwrap();
        write_document_as(&copy, "# two\n").unwrap();
        assert_eq!(std::fs::read(&copy).unwrap(), [&BOM[..], b"# two\n"].concat());

        let ro = dir.join("ro.md");
        std::fs::write(&ro, "keep").unwrap();
        let mut perms = std::fs::metadata(&ro).unwrap().permissions();
        perms.set_readonly(true);
        std::fs::set_permissions(&ro, perms).unwrap();
        assert!(write_document_as(&ro, "x").is_err());
        assert_eq!(std::fs::read_to_string(&ro).unwrap(), "keep");

        let leftovers = std::fs::read_dir(&dir).unwrap().count();
        assert_eq!(leftovers, 2);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_copy_is_byte_for_byte_even_for_read_only_and_non_utf8_sources() {
        let dir = scratch("copy");
        let source = dir.join("src.md");
        let bytes = [&BOM[..], b"caf\xe9 \r\n"].concat(); // BOM, CRLF and a Latin-1 byte
        std::fs::write(&source, &bytes).unwrap();
        let mut perms = std::fs::metadata(&source).unwrap().permissions();
        perms.set_readonly(true);
        std::fs::set_permissions(&source, perms).unwrap();

        let copy = copy_document(&source, &dir.join("copy.md")).unwrap();
        assert_eq!(std::fs::read(&copy).unwrap(), bytes);
        assert!(copy.ends_with("copy.md"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_copy_never_lands_on_its_source_and_obeys_the_name_rules() {
        let dir = scratch("copyrules");
        let source = dir.join("src.md");
        std::fs::write(&source, "text").unwrap();
        assert!(copy_document(&source, &source).unwrap_err().contains("same file"));
        assert!(copy_document(&source, &dir.join("copy.rs")).is_err());
        assert!(copy_document(&dir.join("missing.md"), &dir.join("copy.md")).is_err());

        let other = dir.join("other.md");
        std::fs::write(&other, "old").unwrap();
        copy_document(&source, &other).unwrap();
        assert_eq!(std::fs::read_to_string(&other).unwrap(), "text");
        assert_eq!(std::fs::read_to_string(&source).unwrap(), "text");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn saves_text_and_keeps_bom_and_no_temp_file_is_left() {
        let dir = scratch("bom");
        let file = dir.join("note.md");
        std::fs::write(&file, [&BOM[..], b"old"].concat()).unwrap();
        write_document(&file, "# new\n").unwrap();
        assert_eq!(std::fs::read(&file).unwrap(), [&BOM[..], b"# new\n"].concat());
        let leftovers: Vec<_> = std::fs::read_dir(&dir).unwrap().flatten().collect();
        assert_eq!(leftovers.len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_other_files_read_only_files_and_new_paths() {
        let dir = scratch("refuse");
        let code = dir.join("main.rs");
        std::fs::write(&code, "fn main() {}").unwrap();
        assert!(write_document(&code, "x").is_err());
        assert_eq!(std::fs::read_to_string(&code).unwrap(), "fn main() {}");

        let ro = dir.join("ro.md");
        std::fs::write(&ro, "keep").unwrap();
        let mut perms = std::fs::metadata(&ro).unwrap().permissions();
        perms.set_readonly(true);
        std::fs::set_permissions(&ro, perms).unwrap();
        assert!(write_document(&ro, "x").is_err());
        assert_eq!(std::fs::read_to_string(&ro).unwrap(), "keep");

        assert!(write_document(&dir.join("missing.md"), "x").is_err());
        assert!(!dir.join("missing.md").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn writing_through_a_symlink_keeps_the_link() {
        let dir = scratch("link");
        let real = dir.join("real.md");
        let link = dir.join("link.md");
        std::fs::write(&real, "old").unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();
        write_document(&link, "new").unwrap();
        assert!(std::fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(std::fs::read_to_string(&real).unwrap(), "new");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
