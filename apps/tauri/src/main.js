const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { open } = window.__TAURI__.dialog;

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

listen("file-changed", () => {
  if (currentPath) loadFile(currentPath);
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
