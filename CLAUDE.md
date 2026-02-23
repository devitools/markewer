# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Arandu is a Markdown viewer application built with Tauri (Rust backend + vanilla HTML/JS frontend). It uses `comrak` for GFM rendering and provides:
- GitHub Flavored Markdown support (tables, task lists, strikethrough, autolinks)
- Theme cycling (system/light/dark)
- File watching with live reload
- Sidebar outline navigation
- CLI installer for macOS
- Offline voice-to-text via Whisper
- Plan review comment system

**Note:** The macOS native version (`apps/macos/`) is deprecated and no longer maintained. All active development happens in the Tauri version (`apps/tauri/`).

## Build Commands

### Tauri (requires Rust + Node.js)
```bash
cd apps/tauri
npm install                    # install frontend dependencies
npx tauri dev                  # run in development mode (hot reload on localhost:1420)
npx tauri build                # production build (outputs to src-tauri/target/release)
npx tauri build --target <triple>  # cross-compile (e.g. aarch64-apple-darwin)
```

### Version Management
```bash
scripts/set-version.sh 0.3.0  # updates Cargo.toml, tauri.conf.json, package.json
```

<details>
<summary>Deprecated: macOS Native (no longer maintained)</summary>

```bash
brew install xcodegen          # one-time setup
cd apps/macos
make generate                  # generate .xcodeproj from project.yml
make build                     # build Release config
make install                   # build + install app to ~/Applications + CLI to /usr/local/bin
make dist                      # build + create dist/Arandu.dmg
make clean                     # remove build artifacts and .xcodeproj
```

This version is deprecated and no longer receives updates. Use the Tauri version instead.
</details>

## Architecture

### Tauri App (`apps/tauri/`)
- **Rust backend** (`src-tauri/src/`):
  - `lib.rs` defines all Tauri commands (`render_markdown`, `read_file`, `extract_headings`, `watch_file`, etc.) and app setup
  - `cli_installer.rs` handles macOS CLI installation (conditionally compiled with `#[cfg(target_os = "macos")]`)
  - `whisper.rs` handles offline voice-to-text transcription using Whisper models
  - `comments.rs` manages plan review comments storage
  - Markdown rendering via `comrak` crate, file watching via `notify` crate
- **JS frontend** (`src/`):
  - `main.js` is the single entry point — communicates with Rust via `window.__TAURI__.core.invoke()`
  - `index.html` has the full UI including CLI installer modals, whisper settings, comment system
  - No build step or bundler; plain JS served directly
  - Uses shared CSS from `shared/` directory (symlinked in `src/`)
- **Tauri plugins**: `cli` (CLI arg parsing), `dialog` (file open), `fs` (file read), `updater` (auto-update from GitHub releases)

### Shared Assets (`shared/`)
CSS styles (`style.css`) and highlight.js files. The Tauri frontend symlinks these files in `apps/tauri/src/`.

### Website (`website/`)
Static landing page deployed to Cloudflare Pages. No build step — plain HTML/CSS/JS.

## Release Process

Triggered by pushing a `v*` tag:
1. `release.yml` creates a draft GitHub release with auto-generated changelog
2. `release-tauri.yml` builds Tauri for 4 targets: macOS ARM, macOS Intel, Linux x86_64, Windows x86_64
3. After all builds succeed, the release is published (draft → public)

The website auto-deploys via `deploy-website.yml` on push to `main` when `website/**` changes.

## Key Conventions

- The project language is primarily Portuguese (README, commit messages may mix PT/EN)
- Bundle identifier: `com.devitools.arandu`
- macOS minimum deployment target: 13.0
- Tauri commands are the bridge between JS and Rust — any new backend functionality needs a `#[tauri::command]` function registered in the `invoke_handler`
- The `withGlobalTauri: true` setting exposes Tauri APIs on `window.__TAURI__` (no import needed in JS)
