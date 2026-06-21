use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Clone)]
pub struct SteamGame {
    pub appid: String,
    pub name: String,
    pub install_dir: String,
    pub cover_path: Option<String>,
    pub description: Option<String>,
    pub size_on_disk_bytes: i64,
}

fn default_steam_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(pf86) = std::env::var("ProgramFiles(x86)") {
        paths.push(PathBuf::from(pf86).join("Steam"));
    }
    if let Ok(pf) = std::env::var("ProgramFiles") {
        paths.push(PathBuf::from(pf).join("Steam"));
    }
    paths
}

fn find_steam_install() -> Option<PathBuf> {
    default_steam_paths()
        .into_iter()
        .find(|p| p.join("steamapps").is_dir())
}

fn extract_first_quoted(s: &str) -> Option<String> {
    let start = s.find('"')?;
    let after = &s[start + 1..];
    let end = after.find('"')?;
    Some(after[..end].replace("\\\\", "\\"))
}

fn extract_value(content: &str, key: &str) -> Option<String> {
    let key_pattern = format!("\"{key}\"");
    content.lines().find_map(|line| {
        let trimmed = line.trim();
        trimmed
            .starts_with(&key_pattern)
            .then(|| trimmed.get(key_pattern.len()..))
            .flatten()
            .and_then(extract_first_quoted)
    })
}

fn extract_all_values(content: &str, key: &str) -> Vec<String> {
    let key_pattern = format!("\"{key}\"");
    content
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with(&key_pattern) {
                extract_first_quoted(trimmed.get(key_pattern.len()..)?)
            } else {
                None
            }
        })
        .collect()
}

fn library_folders(steam_path: &Path) -> Vec<PathBuf> {
    let mut libraries = vec![steam_path.to_path_buf()];
    let vdf_path = steam_path.join("steamapps").join("libraryfolders.vdf");
    if let Ok(content) = fs::read_to_string(&vdf_path) {
        for path in extract_all_values(&content, "path") {
            let lib = PathBuf::from(path);
            if lib != steam_path {
                libraries.push(lib);
            }
        }
    }
    libraries
}

fn remote_cover_url(appid: &str) -> String {
    format!("https://cdn.akamai.steamstatic.com/steam/apps/{appid}/library_600x900.jpg")
}

fn fetch_short_description(appid: &str) -> Option<String> {
    let url = format!("https://store.steampowered.com/api/appdetails?appids={appid}&l=german");
    let response = ureq::get(&url)
        .timeout(std::time::Duration::from_secs(5))
        .call()
        .ok()?;
    let body: serde_json::Value = response.into_json().ok()?;
    body.get(appid)?
        .get("data")?
        .get("short_description")?
        .as_str()
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

fn find_cover(steam_path: &Path, appid: &str) -> Option<String> {
    let cache_dir = steam_path.join("appcache").join("librarycache");
    for filename in [
        format!("{appid}_library_600x900.jpg"),
        format!("{appid}_header.jpg"),
        format!("{appid}_icon.jpg"),
    ] {
        let candidate = cache_dir.join(&filename);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().into_owned());
        }
    }
    None
}

pub fn scan_installed_games() -> Result<Vec<SteamGame>, String> {
    let steam_path = find_steam_install().ok_or("Steam-Installation wurde nicht gefunden")?;
    let mut games = Vec::new();

    for library in library_folders(&steam_path) {
        let steamapps = library.join("steamapps");
        let entries = match fs::read_dir(&steamapps) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let is_manifest = path
                .file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("appmanifest_") && n.ends_with(".acf"))
                .unwrap_or(false);
            if !is_manifest {
                continue;
            }
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            let (Some(appid), Some(name), Some(installdir)) = (
                extract_value(&content, "appid"),
                extract_value(&content, "name"),
                extract_value(&content, "installdir"),
            ) else {
                continue;
            };
            let install_dir = steamapps
                .join("common")
                .join(&installdir)
                .to_string_lossy()
                .into_owned();
            let cover_path =
                find_cover(&steam_path, &appid).or_else(|| Some(remote_cover_url(&appid)));
            let description = fetch_short_description(&appid);
            let size_on_disk_bytes = extract_value(&content, "SizeOnDisk")
                .and_then(|s| s.parse::<i64>().ok())
                .unwrap_or(0);
            games.push(SteamGame {
                appid,
                name,
                install_dir,
                cover_path,
                description,
                size_on_disk_bytes,
            });
        }
    }

    games.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(games)
}
