const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { open, confirm } = window.__TAURI__.dialog;
const { getCurrentWindow } = window.__TAURI__.window;

if (navigator.userAgent.includes("Mac")) {
  document.documentElement.classList.add("macos");
}

const THEMES = ["system", "light", "dark"];
const THEME_ICONS = {
  system: '<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1v12A6 6 0 1 1 8 2z"/>',
  light: '<circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 0v2m0 12v2m8-8h-2M2 8H0m13.66-5.66L12.24 3.76M3.76 12.24l-1.42 1.42m0-11.32 1.42 1.42m8.48 8.48 1.42 1.42" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  dark: '<path d="M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277q.792 0 1.533-.16a.79.79 0 0 1 .81.316.73.73 0 0 1-.031.893A8.35 8.35 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.75.75 0 0 1 6 .278z"/>',
};

let currentTheme = localStorage.getItem("arandu-theme") || "system";
let currentPath = null;
let commentsData = { version: "1.0", file_hash: "", comments: [] };
let selectedBlocks = [];

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

    selectedBlocks = [];
    const addBtn = document.getElementById("bottom-bar-add-comment");
    if (addBtn) {
      addBtn.style.display = "none";
      addBtn.textContent = "+ Add Comment";
    }
    hideStaleCommentsBanner();

    // Assign IDs to all commentable blocks
    let headingIdx = 0, paraIdx = 0, listIdx = 0, codeIdx = 0, quoteIdx = 0;

    document.querySelectorAll("#content h1, #content h2, #content h3, #content h4, #content h5, #content h6").forEach((el) => {
      el.id = "mkw-heading-" + headingIdx++;
      el.classList.add("commentable-block");
    });

    document.querySelectorAll("#content p").forEach((el) => {
      el.id = "mkw-para-" + paraIdx++;
      el.classList.add("commentable-block");
    });

    document.querySelectorAll("#content li").forEach((el) => {
      el.id = "mkw-list-" + listIdx++;
      el.classList.add("commentable-block");
      if (el.querySelector('input[type="checkbox"]')) {
        el.style.listStyle = "none";
      }
    });

    document.querySelectorAll("#content pre").forEach((el) => {
      el.id = "mkw-code-" + codeIdx++;
      el.classList.add("commentable-block");
    });

    document.querySelectorAll("#content blockquote").forEach((el) => {
      el.id = "mkw-quote-" + quoteIdx++;
      el.classList.add("commentable-block");
    });

    hljs.highlightAll();
    populateOutline(headings);

    document.body.classList.remove("no-file");
    document.getElementById("toolbar-title").textContent = path.split(/[/\\]/).pop();

    await invoke("watch_file", { path });
    currentPath = path;

    // Load comments for this file
    await loadCommentsForFile(path);

    // Show window when file is loaded
    getCurrentWindow().show();
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

// Comment management functions

async function loadCommentsForFile(markdownPath) {
  try {
    commentsData = await invoke("load_comments", { markdownPath });
    const currentHash = await invoke("hash_file", { path: markdownPath });

    if (commentsData.file_hash && commentsData.file_hash !== currentHash) {
      showStaleCommentsBanner();
    } else {
      hideStaleCommentsBanner();
    }

    commentsData.file_hash = currentHash;
    renderCommentBadges();
    updateBottomBar();

    // Show bottom bar if there are existing comments
    if (commentsData.comments.length > 0) {
      showBottomBar();
    }
  } catch (e) {
    console.error("Failed to load comments:", e);
    commentsData = { version: "1.0", file_hash: "", comments: [] };
    renderCommentBadges();
    updateBottomBar();
    hideBottomBar();
    hideStaleCommentsBanner();
  }
}

async function saveCommentsForFile() {
  if (!currentPath) return;
  try {
    await invoke("save_comments", {
      markdownPath: currentPath,
      commentsData
    });
  } catch (e) {
    console.error("Failed to save comments:", e);
    const banner = document.getElementById("save-error-banner");
    if (banner) {
      banner.style.display = "flex";
    }
  }
}

function addComment(text) {
  if (selectedBlocks.length === 0) return;

  // Create a single comment with all selected block IDs
  const comment = {
    id: crypto.randomUUID(),
    block_ids: selectedBlocks.map(block => block.id),
    text: text,
    timestamp: Date.now(),
    resolved: false,
  };

  commentsData.comments.push(comment);
  saveCommentsForFile();
  renderCommentBadges();
  updateBottomBar();

  // Clear selection
  selectedBlocks.forEach(block => {
    block.classList.remove("selected");
  });
  selectedBlocks = [];

  const addBtn = document.getElementById("bottom-bar-add-comment");
  if (addBtn) {
    addBtn.style.display = "none";
    addBtn.textContent = "+ Add Comment";
  }
}

function deleteComment(commentId) {
  commentsData.comments = commentsData.comments.filter(c => c.id !== commentId);
  saveCommentsForFile();
  renderCommentBadges();
  updateBottomBar();

  // Hide bottom bar if no comments left
  if (commentsData.comments.length === 0) {
    hideBottomBar();
  }
}

function toggleResolve(commentId) {
  const comment = commentsData.comments.find(c => c.id === commentId);
  if (comment) {
    comment.resolved = !comment.resolved;
    saveCommentsForFile();
    updateBottomBar();
  }
}

function renderCommentBadges() {
  // Remove existing badges
  document.querySelectorAll(".comment-badge").forEach(el => el.remove());

  // Group comments by block_id (now need to iterate block_ids array)
  const commentsByBlock = {};
  commentsData.comments.forEach(comment => {
    comment.block_ids.forEach(blockId => {
      if (!commentsByBlock[blockId]) {
        commentsByBlock[blockId] = [];
      }
      commentsByBlock[blockId].push(comment);
    });
  });

  // Add badges to blocks with comments
  Object.keys(commentsByBlock).forEach(blockId => {
    const block = document.getElementById(blockId);
    if (!block) return;

    const count = commentsByBlock[blockId].length;
    const badge = document.createElement("div");
    badge.className = "comment-badge";
    badge.dataset.count = String(count);
    badge.setAttribute("aria-hidden", "true");
    badge.title = `${count} comment${count > 1 ? 's' : ''}`;

    badge.onclick = (e) => {
      e.stopPropagation();
      expandBottomBar();
    };

    block.style.position = "relative";
    block.appendChild(badge);
  });
}

function scrollToCommentInBottomBar(commentId) {
  const commentItem = document.querySelector(`[data-comment-id="${commentId}"]`);
  if (commentItem) {
    commentItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
    commentItem.classList.add("highlight");
    setTimeout(() => commentItem.classList.remove("highlight"), 1500);
  }
}

function showStaleCommentsBanner() {
  const banner = document.getElementById("stale-comments-banner");
  if (banner) banner.style.display = "flex";
}

function hideStaleCommentsBanner() {
  const banner = document.getElementById("stale-comments-banner");
  if (banner) banner.style.display = "none";
}

function expandBottomBar() {
  const bottomBar = document.getElementById("bottom-bar");
  if (bottomBar) {
    bottomBar.classList.add("expanded");
  }
}

function collapseBottomBar() {
  const bottomBar = document.getElementById("bottom-bar");
  if (bottomBar) {
    bottomBar.classList.remove("expanded");
  }
}

function toggleBottomBar() {
  const bottomBar = document.getElementById("bottom-bar");
  if (bottomBar) {
    bottomBar.classList.toggle("expanded");
  }
}

function showBottomBar() {
  const bottomBar = document.getElementById("bottom-bar");
  const contentArea = document.getElementById("content-area");
  if (bottomBar && !bottomBar.classList.contains("visible")) {
    bottomBar.classList.add("visible");
    if (contentArea) {
      const padding = getComputedStyle(bottomBar).getPropertyValue("--bottom-bar-padding").trim() || "64px";
      contentArea.style.paddingBottom = padding;
    }
  }
}

function hideBottomBar() {
  const bottomBar = document.getElementById("bottom-bar");
  const contentArea = document.getElementById("content-area");
  if (bottomBar && bottomBar.classList.contains("visible")) {
    bottomBar.classList.remove("visible");
    if (contentArea) {
      contentArea.style.paddingBottom = "0";
    }
  }
}

function selectBlock(block, multiSelect = false) {
  if (multiSelect) {
    // Cmd/Ctrl+click: toggle this block in selection
    const idx = selectedBlocks.indexOf(block);
    if (idx > -1) {
      selectedBlocks.splice(idx, 1);
      block.classList.remove("selected");
    } else {
      selectedBlocks.push(block);
      block.classList.add("selected");
    }
  } else {
    // Regular click: clear previous selection and select only this block
    document.querySelectorAll(".commentable-block.selected").forEach(el => {
      el.classList.remove("selected");
    });
    selectedBlocks = [block];
    block.classList.add("selected");
  }

  // Show add comment button if at least one block is selected
  const addBtn = document.getElementById("bottom-bar-add-comment");
  if (addBtn) {
    addBtn.style.display = selectedBlocks.length > 0 ? "block" : "none";
    // Update button text to show count
    addBtn.textContent = selectedBlocks.length > 1
      ? `+ Add Comment (${selectedBlocks.length} blocks)`
      : "+ Add Comment";
  }

  // Show bottom bar when user starts reviewing
  if (selectedBlocks.length > 0) {
    showBottomBar();
  }
}

function updateBottomBar() {
  const countEl = document.getElementById("comment-count");
  const list = document.getElementById("bottom-bar-list");

  // Elements may not exist yet during initial load
  if (!countEl || !list) return;

  const count = commentsData.comments.length;
  countEl.textContent = count;
  list.innerHTML = "";

  if (count === 0) {
    list.innerHTML = '<div class="bottom-bar-empty">No comments. Select blocks and click "+ Add Comment"</div>';
    return;
  }

  commentsData.comments.forEach(comment => {
    const item = document.createElement("div");
    item.className = "bottom-bar-item" + (comment.resolved ? " resolved" : "");
    item.dataset.commentId = comment.id;

    const content = document.createElement("div");
    content.className = "comment-content";

    // Block indicators (clickable chips showing H0, P1, Li2...)
    const blockIndicators = document.createElement("div");
    blockIndicators.className = "block-indicators";
    comment.block_ids.forEach(blockId => {
      const chip = document.createElement("span");
      chip.className = "block-chip";
      const blockNum = blockId.match(/\d+$/)?.[0] || "?";
      const typeMap = { heading: "H", para: "P", list: "Li", code: "C", quote: "Q" };
      const typeMatch = blockId.match(/^mkw-(\w+)-/);
      const prefix = typeMatch ? (typeMap[typeMatch[1]] || "B") : "B";
      chip.textContent = `${prefix}${blockNum}`;
      chip.title = `${typeMatch ? typeMatch[1] : "block"} #${blockNum}`;
      chip.onclick = () => {
        const block = document.getElementById(blockId);
        if (block) block.scrollIntoView({ behavior: "smooth", block: "center" });
      };
      blockIndicators.appendChild(chip);
    });

    const commentText = document.createElement("div");
    commentText.className = "comment-text";
    commentText.textContent = comment.text;

    const actions = document.createElement("div");
    actions.className = "comment-actions";

    const resolveBtn = document.createElement("button");
    resolveBtn.textContent = comment.resolved ? "Unresolve" : "Resolve";
    resolveBtn.onclick = () => {
      toggleResolve(comment.id);
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = async () => {
      const result = await confirm("Delete this comment?", {
        title: "Delete Comment",
        kind: "warning"
      });
      if (result) {
        deleteComment(comment.id);
      }
    };

    actions.appendChild(resolveBtn);
    actions.appendChild(deleteBtn);

    content.appendChild(blockIndicators);
    content.appendChild(commentText);
    content.appendChild(actions);

    item.appendChild(content);
    list.appendChild(item);
  });
}

function generateReviewPrompt() {
  const unresolvedComments = commentsData.comments.filter(c => !c.resolved);

  if (unresolvedComments.length === 0) {
    return "# Plan Review\n\nNo unresolved comments. All feedback has been addressed.";
  }

  let prompt = `# Plan Review\n\n`;

  unresolvedComments.forEach((comment, idx) => {
    prompt += `## Comment ${idx + 1}\n`;

    // Extract block contents
    const blockContents = comment.block_ids
      .map(blockId => {
        const block = document.getElementById(blockId);
        if (!block) return null;
        const clone = block.cloneNode(true);
        clone.querySelectorAll(".comment-badge").forEach(el => el.remove());
        return clone.textContent.trim();
      })
      .filter(content => content !== null);

    if (blockContents.length > 0) {
      prompt += `About the block(s):\n`;
      blockContents.forEach(content => {
        // Split into lines and add '> ' prefix to each line
        const lines = content.split('\n');
        lines.forEach(line => {
          prompt += `> ${line}\n`;
        });
      });
      prompt += `\n`;
    }

    prompt += `Message: ${comment.text}\n\n`;
  });

  return prompt;
}

// Block selection event listener
document.addEventListener("click", (e) => {
  const block = e.target.closest(".commentable-block");
  if (block && !e.target.closest(".comment-badge")) {
    const multiSelect = e.metaKey || e.ctrlKey; // Cmd on Mac, Ctrl on Windows/Linux
    selectBlock(block, multiSelect);
  }
});

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
  } else {
    // Show window if no initial file (allows user to open file via menu)
    getCurrentWindow().show();
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

// Bottom bar and comment event listeners

document.getElementById("stale-banner-dismiss").addEventListener("click", hideStaleCommentsBanner);
document.getElementById("save-error-dismiss").addEventListener("click", () => {
  const banner = document.getElementById("save-error-banner");
  if (banner) banner.style.display = "none";
});

// Click ONLY on title to toggle expand/collapse
document.getElementById("bottom-bar-title").addEventListener("click", (e) => {
  toggleBottomBar();
});

document.getElementById("bottom-bar-add-comment").addEventListener("click", () => {
  if (selectedBlocks.length === 0) return;

  const modal = document.getElementById("comment-modal");
  const preview = document.getElementById("comment-block-preview");
  const input = document.getElementById("comment-input");

  if (selectedBlocks.length === 1) {
    const clone = selectedBlocks[0].cloneNode(true);
    clone.querySelectorAll(".comment-badge").forEach(el => el.remove());
    const text = clone.textContent.trim();
    preview.textContent = text.length > 100 ? text.substring(0, 100) + "..." : text;
  } else {
    preview.textContent = `${selectedBlocks.length} blocks selected`;
  }

  input.value = "";
  modal.style.display = "flex";
  input.focus();
});

document.getElementById("comment-submit").addEventListener("click", () => {
  const text = document.getElementById("comment-input").value.trim();
  if (text) {
    addComment(text);
    document.getElementById("comment-modal").style.display = "none";
  }
});

document.getElementById("comment-cancel").addEventListener("click", () => {
  document.getElementById("comment-modal").style.display = "none";
});

document.getElementById("bottom-bar-generate").addEventListener("click", () => {
  const modal = document.getElementById("review-modal");
  const output = document.getElementById("review-output");

  output.value = generateReviewPrompt();
  modal.style.display = "flex";
});

document.getElementById("review-close").addEventListener("click", () => {
  document.getElementById("review-modal").style.display = "none";
});

document.getElementById("review-copy").addEventListener("click", async () => {
  const text = document.getElementById("review-output").value;

  try {
    await window.__TAURI__.clipboardManager.writeText(text);
    alert("Review prompt copied to clipboard!");
    document.getElementById("review-modal").style.display = "none";
  } catch (e) {
    console.error("Failed to copy:", e);
    alert("Failed to copy to clipboard");
  }
});
