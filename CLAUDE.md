# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Arandu is a Markdown viewer application with two frontends that share the same feature set:
- **macOS native** (`apps/macos/`) — Swift + AppKit + WebKit, uses `libcmark_gfm` for GFM rendering
- **Tauri cross-platform** (`apps/tauri/`) — Rust backend + vanilla HTML/JS frontend, uses `comrak` for GFM rendering

Both render GitHub Flavored Markdown (tables, task lists, strikethrough, autolinks), support theme cycling (system/light/dark), file watching with live reload, sidebar outline navigation, and include a CLI installer for macOS.

## Build Commands

### macOS Native (requires Xcode + xcodegen)
```bash
brew install xcodegen          # one-time setup
cd apps/macos
make generate                  # generate .xcodeproj from project.yml
make build                     # build Release config
make install                   # build + install app to ~/Applications + CLI to /usr/local/bin
make dist                      # build + create dist/Arandu.dmg
make clean                     # remove build artifacts and .xcodeproj
```

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
scripts/set-version.sh 0.3.0  # updates Info.plist, Cargo.toml, tauri.conf.json, package.json
```

## Architecture

### Shared Assets (`shared/`)
CSS styles (`style.css`) and highlight.js files shared between both apps. The Tauri frontend has copies in `apps/tauri/src/`; the macOS app bundles them from `apps/macos/Sources/Arandu/Resources/`.

### macOS Native App (`apps/macos/`)
Single-file Swift app (`Sources/Arandu/main.swift`) containing AppDelegate, MarkdownWindowController, CLIInstaller, and all UI logic. Uses `project.yml` (XcodeGen) to generate the Xcode project. Markdown rendering via C library `libcmark_gfm`. File watching uses `DispatchSource`.

### Tauri App (`apps/tauri/`)
- **Rust backend** (`src-tauri/src/`): `lib.rs` defines all Tauri commands (`render_markdown`, `read_file`, `extract_headings`, `watch_file`, etc.) and app setup. `cli_installer.rs` handles macOS CLI installation (conditionally compiled with `#[cfg(target_os = "macos")]`). Markdown rendering via `comrak` crate. File watching via `notify` crate.
- **JS frontend** (`src/`): `main.js` is the single entry point — communicates with Rust via `window.__TAURI__.core.invoke()`. `index.html` has the full UI including CLI installer modals. No build step or bundler; plain JS served directly.
- **Tauri plugins**: `cli` (CLI arg parsing), `dialog` (file open), `fs` (file read), `updater` (auto-update from GitHub releases).

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
