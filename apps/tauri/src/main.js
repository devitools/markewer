const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { open } = window.__TAURI__.dialog;
const { getCurrentWindow } = window.__TAURI__.window;

const currentWindow = getCurrentWindow();

currentWindow.onCloseRequested(async (event) => {
  event.preventDefault();
  await currentWindow.hide();
});

if (navigator.userAgent.includes("Mac")) {
  document.documentElement.classList.add("macos");
}

const THEMES = ["system", "light", "dark"];
const THEME_ICONS = {
  system: '<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1v12A6 6 0 1 1 8 2z"/>',
  light: '<circle cx="8" cy="8" r="3"/><path d="M8 0v2m0 12v2m8-8h-2M2 8H0m13.66-5.66L12.24 3.76M3.76 12.24l-1.42 1.42m0-11.32 1.42 1.42m8.48 8.48 1.42 1.42"/>',
  dark: '<path d="M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277q.792 0 1.533-.16a.79.79 0 0 1 .81.316.73.73 0 0 1-.031.893A8.35 8.35 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.75.75 0 0 1 6 .278z"/>',
};

let currentTheme = localStorage.getItem("arandu-theme") || "system";
let currentPath = null;

function applyTheme(theme) {
  currentTheme = theme;
  localStorage.setItem("arandu-theme", theme);
  document.documentElement.classList.remove("light", "dark");
  if (theme !== "system") {
    document.documentElement.classList.add(theme);
  }

  const lightLink = document.querySelector('link[href*="highlight-light"]');
  const darkLink = document.querySelector('link[href*="highlight-dark"]');
  if (theme === "light") {
    lightLink.media = "all";
    darkLink.media = "not all";
  } else if (theme === "dark") {
    lightLink.media = "not all";
    darkLink.media = "all";
  } else {
    lightLink.media = "(prefers-color-scheme: light)";
    darkLink.media = "(prefers-color-scheme: dark)";
  }

  const icon = document.getElementById("icon-theme");
  icon.innerHTML = THEME_ICONS[theme];
}

function toggleTheme() {
  const idx = THEMES.indexOf(currentTheme);
  applyTheme(THEMES[(idx + 1) % THEMES.length]);
}

async function loadFile(path) {
  try {
    const content = await invoke("read_file", { path });
    const html = await invoke("render_markdown", { content });
    const headings = await invoke("extract_headings", { markdown: content });

    document.getElementById("content").innerHTML = html;

    let idx = 0;
    document.querySelectorAll("#content h1, #content h2, #content h3, #content h4").forEach((el) => {
      el.id = "mkw-heading-" + idx++;
    });

    document.querySelectorAll("#content li").forEach((li) => {
      if (li.querySelector('input[type="checkbox"]')) {
        li.style.listStyle = "none";
      }
    });

    hljs.highlightAll();
    populateOutline(headings);

    document.body.classList.remove("no-file");
    document.getElementById("toolbar-title").textContent = path.split(/[/\\]/).pop();

    await invoke("watch_file", { path });
    currentPath = path;
  } catch (e) {
    console.error("Failed to load file:", e);
  }
}

function populateOutline(headings) {
  const list = document.getElementById("outline-list");
  list.innerHTML = "";
  headings.forEach((h) => {
    const li = document.createElement("li");
    li.textContent = h.text;
    li.dataset.level = h.level;
    li.addEventListener("click", () => {
      const el = document.getElementById("mkw-heading-" + h.index);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    list.appendChild(li);
  });
}

async function openFileDialog() {
  const path = await open({
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  if (path) loadFile(path);
}

document.getElementById("btn-theme").addEventListener("click", toggleTheme);
document.getElementById("btn-refresh").addEventListener("click", () => {
  if (currentPath) loadFile(currentPath);
});
document.getElementById("btn-open").addEventListener("click", openFileDialog);

document.getElementById("toolbar").addEventListener("mousedown", (e) => {
  if (e.target.closest("button")) return;
  getCurrentWindow().startDragging();
});

const sidebarHandle = document.getElementById("sidebar-handle");
const sidebar = document.getElementById("sidebar");
sidebarHandle.addEventListener("mousedown", (e) => {
  e.preventDefault();
  sidebarHandle.classList.add("active");
  const onMove = (ev) => {
    const width = Math.max(120, Math.min(500, ev.clientX));
    sidebar.style.width = width + "px";
    sidebar.style.minWidth = width + "px";
  };
  const onUp = () => {
    sidebarHandle.classList.remove("active");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
});

listen("file-changed", () => {
  if (currentPath) loadFile(currentPath);
});

// Voice-to-text recording state

const recordingBtn = document.getElementById("recording-btn");
let isRecording = false;
let currentShortcutLabel = "⌥Space";

function setRecordingState(state) {
  recordingBtn.className = "recording-" + state;
  switch (state) {
    case "active":
      recordingBtn.title = "Recording... (" + currentShortcutLabel + " to stop)";
      break;
    case "processing":
      recordingBtn.title = "Transcribing...";
      break;
    default:
      recordingBtn.title = "Voice-to-text (" + currentShortcutLabel + ")";
  }
}

listen("start-recording", () => {
  isRecording = true;
  setRecordingState("active");
});

listen("stop-recording", () => {
  if (isRecording) {
    isRecording = false;
    setRecordingState("processing");
  }
});

listen("transcription-complete", () => {
  setRecordingState("idle");
  isRecording = false;
});

listen("recording-error", (event) => {
  console.error("Recording error:", event.payload);
  isRecording = false;
  setRecordingState("idle");
});

listen("transcription-error", (event) => {
  console.error("Transcription error:", event.payload);
  setRecordingState("idle");
  isRecording = false;
});

// Whisper settings modal

async function loadModelList() {
  const models = await invoke("list_models");
  const settings = await invoke("get_whisper_settings");
  const list = document.getElementById("whisper-model-list");
  list.innerHTML = "";

  models.forEach((m) => {
    const row = document.createElement("div");
    row.className = "model-row";

    const info = document.createElement("div");
    info.className = "model-info";
    info.innerHTML = `<strong>${m.info.id}</strong><span class="model-desc">${m.info.description}</span>`;

    const actions = document.createElement("div");
    actions.className = "model-actions";

    if (m.downloaded) {
      const isActive = settings.active_model === m.info.id;
      const useBtn = document.createElement("button");
      useBtn.className = "modal-btn" + (isActive ? " modal-btn-primary" : "");
      useBtn.textContent = isActive ? "Active" : "Use";
      useBtn.disabled = isActive;
      useBtn.addEventListener("click", async () => {
        await invoke("set_active_model", { modelId: m.info.id });
        loadModelList();
      });
      actions.appendChild(useBtn);

      if (!isActive) {
        const delBtn = document.createElement("button");
        delBtn.className = "modal-btn model-btn-danger";
        delBtn.textContent = "Delete";
        delBtn.addEventListener("click", async () => {
          await invoke("delete_model", { modelId: m.info.id });
          loadModelList();
        });
        actions.appendChild(delBtn);
      }
    } else {
      const dlBtn = document.createElement("button");
      dlBtn.className = "modal-btn modal-btn-primary";
      dlBtn.textContent = "Download";
      dlBtn.addEventListener("click", async () => {
        dlBtn.disabled = true;
        dlBtn.textContent = "0%";
        const unlisten = await listen("model-download-progress", (event) => {
          const { downloaded, total } = event.payload;
          const pct = Math.round((downloaded / total) * 100);
          dlBtn.textContent = pct + "%";
        });
        try {
          await invoke("download_model", { modelId: m.info.id });
          unlisten();
          loadModelList();
        } catch (e) {
          unlisten();
          dlBtn.disabled = false;
          dlBtn.textContent = "Retry";
          console.error("Download failed:", e);
        }
      });
      actions.appendChild(dlBtn);
    }

    row.appendChild(info);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

document.getElementById("whisper-settings-close").addEventListener("click", () => {
  hideModal("whisper-settings-modal");
});

recordingBtn.addEventListener("click", async () => {
  if (!isRecording) {
    const modelLoaded = await invoke("is_model_loaded");
    if (!modelLoaded) {
      openWhisperSettings();
      return;
    }
    isRecording = true;
    setRecordingState("active");
    try {
      await invoke("start_recording");
    } catch (e) {
      console.error("Failed to start recording:", e);
      isRecording = false;
      setRecordingState("idle");
    }
  } else {
    isRecording = false;
    setRecordingState("processing");
    try {
      const text = await invoke("stop_and_transcribe");
      if (text) {
        await window.__TAURI__.clipboardManager.writeText(text);
      }
      setRecordingState("idle");
    } catch (e) {
      console.error("Transcription failed:", e);
      setRecordingState("idle");
    }
  }
});

document.getElementById("whisper-settings-btn").addEventListener("click", () => {
  openWhisperSettings();
});

async function openWhisperSettings() {
  await loadModelList();
  const settings = await invoke("get_whisper_settings");
  document.getElementById("shortcut-input").value = settings.shortcut || "Alt+Space";
  showModal("whisper-settings-modal");
}

// Shortcut configuration
const shortcutInput = document.getElementById("shortcut-input");
const shortcutRecordBtn = document.getElementById("shortcut-record-btn");
let recordingShortcut = false;

shortcutRecordBtn.addEventListener("click", () => {
  if (recordingShortcut) return;
  recordingShortcut = true;
  shortcutInput.value = "Press keys...";
  shortcutInput.classList.add("recording-shortcut");
  shortcutRecordBtn.textContent = "Listening...";
  shortcutRecordBtn.disabled = true;
});

shortcutInput.addEventListener("keydown", async (e) => {
  if (!recordingShortcut) return;
  e.preventDefault();
  e.stopPropagation();

  if (e.key === "Escape") {
    recordingShortcut = false;
    shortcutInput.classList.remove("recording-shortcut");
    shortcutRecordBtn.textContent = "Change";
    shortcutRecordBtn.disabled = false;
    const settings = await invoke("get_whisper_settings");
    shortcutInput.value = settings.shortcut || "Alt+Space";
    return;
  }

  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;

  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");

  let key = e.key;
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();
  parts.push(key);

  const shortcut = parts.join("+");
  shortcutInput.value = shortcut;

  try {
    await invoke("set_shortcut", { shortcut });
    currentShortcutLabel = shortcut.replace("Alt", "⌥").replace("Ctrl", "⌃").replace("Shift", "⇧").replace("Super", "⌘").replace("+", "");
    setRecordingState("idle");
  } catch (err) {
    shortcutInput.value = "Invalid — try again";
    setTimeout(() => { shortcutInput.value = "Press keys..."; }, 1500);
    return;
  }

  recordingShortcut = false;
  shortcutInput.classList.remove("recording-shortcut");
  shortcutRecordBtn.textContent = "Change";
  shortcutRecordBtn.disabled = false;
});

listen("open-file", (event) => {
  loadFile(event.payload);
});

// CLI installer modals

function showModal(id) {
  document.getElementById(id).style.display = "flex";
}

function hideModal(id) {
  document.getElementById(id).style.display = "none";
}

async function handleCliInstall() {
  hideModal("cli-modal");
  const result = await invoke("install_cli");
  const titleEl = document.getElementById("cli-result-title");
  const msgEl = document.getElementById("cli-result-message");
  if (result.success) {
    titleEl.textContent = "CLI Installed";
    msgEl.textContent = `The "arandu" command was installed at:\n${result.path}\n\nYou can now use: arandu README.md`;
    await invoke("dismiss_cli_prompt");
  } else {
    titleEl.textContent = "Installation Failed";
    msgEl.textContent = result.error;
  }
  showModal("cli-result-modal");
}

function handleCliNotNow() {
  if (document.getElementById("cli-dismiss-check").checked) {
    invoke("dismiss_cli_prompt");
  }
  hideModal("cli-modal");
}

document.getElementById("cli-install").addEventListener("click", handleCliInstall);
document.getElementById("cli-not-now").addEventListener("click", handleCliNotNow);
document.getElementById("cli-result-ok").addEventListener("click", () => hideModal("cli-result-modal"));

(async () => {
  const initialFile = await invoke("get_initial_file");
  if (initialFile) {
    loadFile(initialFile);
  }

  const status = await invoke("check_cli_status");
  if (!status.installed && !status.dismissed) {
    showModal("cli-modal");
  }
})();

listen("menu-install-cli", () => {
  document.getElementById("cli-dismiss-check").checked = false;
  showModal("cli-modal");
});

listen("menu-open-file", () => {
  openFileDialog();
});

applyTheme(currentTheme);

if (!currentPath) {
  document.body.classList.add("no-file");
}
