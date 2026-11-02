//! The user's theme files: `$XDG_CONFIG_HOME/mdview/themes/*.css`
//! (else `~/.config/mdview/themes`). A theme is a CSS file that redefines the
//! colour tokens of the page; the client applies it. This module only finds
//! and reads the files, the same way `src/server/themes.ts` does for the
//! browser stage.

use std::path::{Path, PathBuf};

use serde::Serialize;

/// A theme is a few dozen lines; anything bigger is not one.
const MAX_THEME_BYTES: u64 = 256 * 1024;
const MAX_THEMES: usize = 50;

#[derive(Serialize, Debug, PartialEq)]
pub struct ThemeFile {
    name: String,
    css: String,
}

#[derive(Serialize)]
pub struct ThemeList {
    /// Shown to the user, with the home folder written as `~`.
    dir: String,
    themes: Vec<ThemeFile>,
}

/// `xdg` is used only when it is an absolute path, as the XDG spec requires.
pub fn themes_dir(xdg: Option<&str>, home: Option<&str>) -> Option<PathBuf> {
    let base = match xdg {
        Some(x) if Path::new(x).is_absolute() => PathBuf::from(x),
        _ => Path::new(home?).join(".config"),
    };
    Some(base.join("mdview").join("themes"))
}

pub fn short_path(path: &Path, home: Option<&str>) -> String {
    if let Some(home) = home {
        if let Ok(rest) = path.strip_prefix(home) {
            return format!("~/{}", rest.display());
        }
    }
    path.display().to_string()
}

/// Every readable `*.css` in the folder, by file name. A missing folder is no themes.
pub fn read_themes(dir: &Path) -> Vec<ThemeFile> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut paths: Vec<PathBuf> = entries.filter_map(|e| e.ok().map(|e| e.path())).collect();
    paths.sort();
    let mut themes = Vec::new();
    for path in paths {
        if themes.len() >= MAX_THEMES {
            break;
        }
        let Some(file_name) = path.file_name().map(|n| n.to_string_lossy().into_owned()) else {
            continue;
        };
        let is_css = path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("css"));
        if file_name.starts_with('.') || !is_css {
            continue;
        }
        let Ok(meta) = std::fs::metadata(&path) else { continue };
        if !meta.is_file() || meta.len() > MAX_THEME_BYTES {
            continue;
        }
        let Ok(bytes) = std::fs::read(&path) else { continue };
        let name = path
            .file_stem()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        themes.push(ThemeFile {
            name,
            css: String::from_utf8_lossy(&bytes).into_owned(),
        });
    }
    themes
}

/// The folder and the themes in it, for the picker.
#[tauri::command]
pub fn list_themes() -> ThemeList {
    let home = std::env::var("HOME").ok();
    let xdg = std::env::var("XDG_CONFIG_HOME").ok();
    match themes_dir(xdg.as_deref(), home.as_deref()) {
        Some(dir) => ThemeList {
            dir: short_path(&dir, home.as_deref()),
            themes: read_themes(&dir),
        },
        None => ThemeList {
            dir: String::new(),
            themes: Vec::new(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn follows_xdg_when_absolute_else_home() {
        assert_eq!(
            themes_dir(Some("/x/cfg"), Some("/home/u")),
            Some(PathBuf::from("/x/cfg/mdview/themes"))
        );
        assert_eq!(
            themes_dir(None, Some("/home/u")),
            Some(PathBuf::from("/home/u/.config/mdview/themes"))
        );
        assert_eq!(
            themes_dir(Some("relative"), Some("/home/u")),
            Some(PathBuf::from("/home/u/.config/mdview/themes"))
        );
        assert_eq!(themes_dir(None, None), None);
    }

    #[test]
    fn home_is_written_as_tilde() {
        assert_eq!(
            short_path(Path::new("/home/u/.config/mdview/themes"), Some("/home/u")),
            "~/.config/mdview/themes"
        );
        assert_eq!(short_path(Path::new("/home/ux/t"), Some("/home/u")), "/home/ux/t");
    }

    #[test]
    fn reads_css_files_and_skips_the_rest() {
        let dir = std::env::temp_dir().join(format!("mdview-themes-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("folder.css")).unwrap();
        std::fs::write(dir.join("forest.css"), ":root{--bg:green}").unwrap();
        std::fs::write(dir.join("Night Owl.CSS"), ":root{--bg:black}").unwrap();
        std::fs::write(dir.join("notes.txt"), "no").unwrap();
        std::fs::write(dir.join(".hidden.css"), "no").unwrap();
        std::fs::write(dir.join("huge.css"), vec![b'a'; MAX_THEME_BYTES as usize + 1]).unwrap();
        let themes = read_themes(&dir);
        let names: Vec<&str> = themes.iter().map(|t| t.name.as_str()).collect();
        assert_eq!(names, ["Night Owl", "forest"]);
        assert_eq!(themes[1].css, ":root{--bg:green}");
        assert!(read_themes(&dir.join("missing")).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
