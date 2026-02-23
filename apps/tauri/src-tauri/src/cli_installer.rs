use serde::Serialize;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::process::Command;

const CLI_SCRIPT: &str = r#"#!/bin/bash
SOCKET="$HOME/.arandu/arandu.sock"

# Se socket existe, usar IPC (caminho rápido)
if [ -S "$SOCKET" ]; then
    for f in "$@"; do
        ABS="$(cd "$(dirname "$f")" 2>/dev/null && echo "$PWD/$(basename "$f")")"
        echo "{\"command\":\"open\",\"path\":\"$ABS\"}" | nc -U "$SOCKET" -w 2 2>/dev/null
    done
    exit 0
fi

# Fallback: método tradicional com open (inicia app se necessário)
APP=""
for p in "/Applications/Arandu.app" "$HOME/Applications/Arandu.app"; do
    [ -d "$p" ] && APP="$p" && break
done
[ -z "$APP" ] && echo "Arandu.app not found." >&2 && exit 1
if [ "$#" -eq 0 ]; then open "$APP"; else
    PATHS=(); for f in "$@"; do
        PATHS+=("$(cd "$(dirname "$f")" 2>/dev/null && echo "$PWD/$(basename "$f")")")
    done; open "$APP" --args "${PATHS[@]}"
fi
"#;

const DISMISSED_FILE: &str = ".cli-install-dismissed";

#[derive(Debug, Serialize, Clone)]
pub struct InstallResult {
    pub success: bool,
    pub path: String,
    pub error: String,
}

pub fn is_cli_installed() -> bool {
    let home = home_dir().unwrap_or_default();
    let paths = [
        PathBuf::from("/usr/local/bin/arandu"),
        home.join(".local/bin/arandu"),
    ];
    paths.iter().any(|p| p.is_file())
}

pub fn has_been_dismissed(app_data_dir: &PathBuf) -> bool {
    app_data_dir.join(DISMISSED_FILE).exists()
}

pub fn set_dismissed(app_data_dir: &PathBuf) {
    let _ = fs::create_dir_all(app_data_dir);
    let _ = fs::write(app_data_dir.join(DISMISSED_FILE), "");
}

pub fn install() -> InstallResult {
    let tmp = std::env::temp_dir().join("arandu-cli-install");
    if let Err(e) = fs::write(&tmp, CLI_SCRIPT) {
        return InstallResult {
            success: false,
            path: String::new(),
            error: format!("Could not write temporary file: {e}"),
        };
    }

    let global = PathBuf::from("/usr/local/bin/arandu");

    // Attempt 1: direct copy (works if /usr/local/bin is writable)
    if let Ok(()) = try_direct_install(&tmp, &global) {
        let _ = fs::remove_file(&tmp);
        return InstallResult {
            success: true,
            path: global.to_string_lossy().into(),
            error: String::new(),
        };
    }

    // Attempt 2: privilege escalation via osascript
    if try_privileged_install(&tmp, &global) {
        let _ = fs::remove_file(&tmp);
        return InstallResult {
            success: true,
            path: global.to_string_lossy().into(),
            error: String::new(),
        };
    }

    // Attempt 3: fallback to ~/.local/bin
    let home = home_dir().unwrap_or_default();
    let local_dir = home.join(".local/bin");
    let local_path = local_dir.join("arandu");

    match try_local_install(&tmp, &local_dir, &local_path) {
        Ok(()) => {
            let _ = fs::remove_file(&tmp);
            InstallResult {
                success: true,
                path: local_path.to_string_lossy().into(),
                error: String::new(),
            }
        }
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            InstallResult {
                success: false,
                path: String::new(),
                error: format!("Could not install CLI: {e}"),
            }
        }
    }
}

fn home_dir() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}

fn try_direct_install(src: &PathBuf, dest: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    if dest.exists() {
        fs::remove_file(dest)?;
    }
    fs::copy(src, dest)?;
    fs::set_permissions(dest, fs::Permissions::from_mode(0o755))?;
    Ok(())
}

fn try_privileged_install(src: &PathBuf, dest: &PathBuf) -> bool {
    let script = format!(
        "do shell script \"cp '{}' '{}' && chmod +x '{}'\" with administrator privileges",
        src.display(),
        dest.display(),
        dest.display()
    );
    Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn try_local_install(
    src: &PathBuf,
    dir: &PathBuf,
    dest: &PathBuf,
) -> Result<(), Box<dyn std::error::Error>> {
    fs::create_dir_all(dir)?;
    if dest.exists() {
        fs::remove_file(dest)?;
    }
    fs::copy(src, dest)?;
    fs::set_permissions(dest, fs::Permissions::from_mode(0o755))?;
    Ok(())
}
