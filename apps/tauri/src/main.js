const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { open, confirm } = window.__TAURI__.dialog;
const { getCurrentWindow } = window.__TAURI__.window;

const currentWindow = getCurrentWindow();

console.log("Registering onCloseRequested handler");

currentWindow.onCloseRequested(async (event) => {
  console.log("Close requested - preventing and hiding");
  try {
    event.preventDefault();
    await currentWindow.hide();
    console.log("Window hidden successfully");
  } catch (error) {
    console.error("Error in onCloseRequested:", error);
  }
});

if (navigator.userAgent.includes("Mac")) {
  document.documentElement.classList.add("macos");
} else {
  // Update shortcut hint for non-macOS platforms
  const shortcutHint = document.querySelector("#btn-open .shortcut-hint");
  if (shortcutHint) {
    shortcutHint.textContent = "Ctrl+O";
  }
}

const THEMES = ["system", "light", "dark"];
const THEME_ICONS = {
  system: '<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1v12A6 6 0 1 1 8 2z"/>',
  light: '<circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 0v2m0 12v2m8-8h-2M2 8H0m13.66-5.66L12.24 3.76M3.76 12.24l-1.42 1.42m0-11.32 1.42 1.42m8.48 8.48 1.42 1.42" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  dark: '<path d="M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277q.792 0 1.533-.16a.79.79 0 0 1 .81.316.73.73 0 0 1-.031.893A8.35 8.35 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.75.75 0 0 1 6 .278z"/>',
};

let currentTheme = localStorage.getItem("arandu-theme") || "system";
let currentPath = null;
let commentsData = { version: "1.0", file_hash: "", comments: [] };
let selectedBlocks = [];
let saveQueue = Promise.resolve();

class TabState {
  constructor(path) {
    this.id = crypto.randomUUID();
    this.path = path;

    // Display folder/filename with smart truncation
    const parts = path.split('/');
    if (parts.length > 1) {
      const fileName = parts[parts.length - 1];
      const folderName = parts[parts.length - 2];

      // Truncate folder name in the middle if too long
      const maxFolderLength = 20;
      let displayFolder = folderName;
      if (folderName.length > maxFolderLength) {
        const charsToShow = maxFolderLength - 3;
        const frontChars = Math.ceil(charsToShow / 2);
        const backChars = Math.floor(charsToShow / 2);
        displayFolder = folderName.substring(0, frontChars) + '...' + folderName.substring(folderName.length - backChars);
      }

      this.displayName = displayFolder + '/' + fileName;
    } else {
      this.displayName = parts[0];
    }

    this.scrollPosition = 0;

    this.content = null;
    this.html = null;
    this.headings = null;

    this.commentsData = { version: "1.0", file_hash: "", comments: [] };
    this.selectedBlocks = [];

    this.lastAccessed = Date.now();
  }
}

let tabs = [];
let activeTabId = null;
let fileHistory = { version: "1.0", max_entries: 20, entries: [] };

function getActiveTab() {
  return tabs.find(t => t.id === activeTabId);
}

function getTabByPath(path) {
  return tabs.find(t => t.path === path);
}

function formatPath(path) {
  if (!path) return "";

  // Try to detect home directory pattern
  // macOS/Linux: /Users/username or /home/username
  const match = path.match(/^(\/Users\/[^\/]+|\/home\/[^\/]+)(\/.*)?$/);
  if (match) {
    return '~' + (match[2] || '');
  }
  return path;
}

function truncateMiddle(str, maxLength = 40) {
  if (str.length <= maxLength) return str;
  const charsToShow = maxLength - 3; // Reserve 3 chars for "..."
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);
  return str.substring(0, frontChars) + '...' + str.substring(str.length - backChars);
}

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

function assignCommentableBlockIds() {
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
}

async function loadFileHistory() {
  try {
    fileHistory = await invoke("load_history");
  } catch (e) {
    console.warn("Failed to load history:", e);
  }
}

async function addToHistory(path) {
  try {
    await invoke("add_to_history", { filePath: path });
    await loadFileHistory();
  } catch (e) {
    console.error("Failed to update history:", e);
  }
}

async function openFileInNewTab(path) {
  const existing = getTabByPath(path);
  if (existing) {
    switchToTab(existing.id);
    return;
  }

  const tab = new TabState(path);
  tabs.push(tab);
  activeTabId = tab.id;

  await loadFileIntoTab(tab.id, path);
  await addToHistory(path);

  updateTabBarUI();
}

async function loadFileIntoTab(tabId, path) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  try {
    const content = await invoke("read_file", { path });
    const html = await invoke("render_markdown", { content });
    const headings = await invoke("extract_headings", { markdown: content });

    tab.content = content;
    tab.html = html;
    tab.headings = headings;

    tab.commentsData = await invoke("load_comments", { markdownPath: path });
    const currentHash = await invoke("hash_file", { path });

    if (tab.commentsData.file_hash && tab.commentsData.file_hash !== currentHash) {
      showStaleCommentsBanner();
    }
    tab.commentsData.file_hash = currentHash;

    await invoke("watch_file", { path });

    if (tabId === activeTabId) {
      renderTabContent(tab);
    }

    tab.lastAccessed = Date.now();
    getCurrentWindow().show();
  } catch (e) {
    console.error("Failed to load file:", e);
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      tab.displayName = `${tab.displayName} (missing)`;
      if (tabId === activeTabId) {
        document.getElementById("content").innerHTML = `
          <div class="error-state" style="text-align: center; padding: 40px;">
            <h3>File Not Found</h3>
            <p>${path}</p>
            <button onclick="closeTab('${tabId}')" class="btn btn-primary">Close Tab</button>
          </div>
        `;
      }
    }
  }
}

function renderTabContent(tab) {
  document.getElementById("content").innerHTML = tab.html;

  selectedBlocks = [];
  const addBtn = document.getElementById("bottom-bar-add-comment");
  if (addBtn) {
    addBtn.style.display = "none";
    addBtn.textContent = "+ Add Comment";
  }
  hideStaleCommentsBanner();

  assignCommentableBlockIds();

  hljs.highlightAll();
  populateOutline(tab.headings);

  document.body.classList.remove("no-file");
  document.getElementById("toolbar-title").textContent = formatPath(tab.path);
  document.getElementById("toolbar-title").title = tab.path;
  document.getElementById("toolbar-info").style.display = "flex";

  currentPath = tab.path;
  commentsData = JSON.parse(JSON.stringify(tab.commentsData));
  selectedBlocks = [...tab.selectedBlocks];

  renderCommentBadges();
  updateBottomBar();

  if (commentsData.comments.length > 0) {
    showBottomBar();
  }
}

function updateTabBarUI() {
  const tabScroll = document.querySelector(".tab-scroll");
  if (!tabScroll) return;

  tabScroll.innerHTML = "";

  tabs.forEach(tab => {
    const tabItem = document.createElement("div");
    tabItem.className = "tab-item";
    if (tab.id === activeTabId) {
      tabItem.classList.add("active");
    }
    tabItem.dataset.tabId = tab.id;

    const tabName = document.createElement("span");
    tabName.className = "tab-name";
    tabName.textContent = tab.displayName;

    const tabClose = document.createElement("button");
    tabClose.className = "tab-close";
    tabClose.textContent = "×";
    tabClose.setAttribute("aria-label", "Close");
    tabClose.onclick = (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    };

    tabItem.appendChild(tabName);
    tabItem.appendChild(tabClose);

    tabItem.onclick = () => {
      if (tab.id !== activeTabId) {
        switchToTab(tab.id);
      }
    };

    tabScroll.appendChild(tabItem);
  });
}

function switchToTab(tabId) {
  const prevTab = getActiveTab();
  if (prevTab) {
    prevTab.scrollPosition = document.getElementById("content-area").scrollTop;
    prevTab.selectedBlocks = [...selectedBlocks];
    prevTab.commentsData = JSON.parse(JSON.stringify(commentsData));
  }

  activeTabId = tabId;
  const tab = getActiveTab();
  if (!tab) return;

  commentsData = JSON.parse(JSON.stringify(tab.commentsData));
  selectedBlocks = [...tab.selectedBlocks];
  currentPath = tab.path;

  if (tab.html) {
    renderTabContent(tab);
    setTimeout(() => {
      document.getElementById("content-area").scrollTop = tab.scrollPosition;
    }, 0);
  } else {
    loadFileIntoTab(tabId, tab.path);
  }

  updateTabBarUI();
  tab.lastAccessed = Date.now();
}

async function closeTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  tabs = tabs.filter(t => t.id !== tabId);

  const stillWatched = tabs.some(t => t.path === tab.path);
  if (!stillWatched) {
    try {
      await invoke("unwatch_file", { path: tab.path });
    } catch (e) {
      console.warn("Failed to unwatch file:", e);
    }
  }

  if (activeTabId === tabId) {
    if (tabs.length > 0) {
      const index = tabs.findIndex(t => t.id === tabId);
      const nextTab = tabs[Math.max(0, index - 1)] || tabs[0];
      switchToTab(nextTab.id);
    } else {
      closeAllTabs();
    }
  }

  updateTabBarUI();
}

function closeAllTabs() {
  activeTabId = null;
  currentPath = null;
  tabs = [];
  document.body.classList.add("no-file");
  document.getElementById("toolbar-info").style.display = "none";
  document.getElementById("content").innerHTML = "";
  document.getElementById("outline-list").innerHTML = "";
  hideBottomBar();
}

async function showHistoryDropdown() {
  await loadFileHistory();

  const list = document.getElementById("history-list");
  list.innerHTML = "";

  if (fileHistory.entries.length === 0) {
    list.innerHTML = '<div class="history-empty">No recent files</div>';
  } else {
    fileHistory.entries.forEach(entry => {
      const item = document.createElement("div");
      item.className = "history-item";

      const name = document.createElement("span");
      name.className = "history-name";
      name.textContent = entry.path.split('/').pop();
      name.title = entry.path.split('/').pop(); // Full name on hover

      const path = document.createElement("span");
      path.className = "history-path";
      path.textContent = truncateMiddle(formatPath(entry.path), 55);
      path.title = entry.path; // Full path on hover

      item.appendChild(name);
      item.appendChild(path);

      item.onclick = () => {
        openFileInNewTab(entry.path);
        hideHistoryDropdown();
      };

      list.appendChild(item);
    });
  }

  document.getElementById("history-dropdown").style.display = "block";
}

function hideHistoryDropdown() {
  document.getElementById("history-dropdown").style.display = "none";
}

async function clearHistory() {
  try {
    await invoke("clear_history");
    fileHistory.entries = [];
    hideHistoryDropdown();
  } catch (e) {
    console.error("Failed to clear history:", e);
  }
}

let headingObserver = null;

function populateOutline(headings) {
  const list = document.getElementById("outline-list");
  list.innerHTML = "";
  headings.forEach((h) => {
    const li = document.createElement("li");
    li.textContent = h.text;
    li.dataset.level = h.level;
    li.dataset.headingIndex = h.index;
    li.addEventListener("click", () => {
      const el = document.getElementById("mkw-heading-" + h.index);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    list.appendChild(li);
  });

  setupScrollTracking(headings);
}

function setupScrollTracking(headings) {
  if (headingObserver) {
    headingObserver.disconnect();
  }

  const contentArea = document.getElementById("content-area");
  const outlineList = document.getElementById("outline-list");
  const activeHeadings = new Map();
  let lastActiveIndex = null;

  headingObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const headingId = entry.target.id;
        const index = headingId.replace("mkw-heading-", "");

        if (entry.isIntersecting) {
          activeHeadings.set(index, entry.intersectionRatio);
        } else {
          activeHeadings.delete(index);
        }
      });

      outlineList.querySelectorAll("li.active").forEach((li) => {
        li.classList.remove("active");
      });

      let activeIndex = null;

      if (activeHeadings.size > 0) {
        const mostVisible = Array.from(activeHeadings.entries()).reduce((a, b) =>
          a[1] > b[1] ? a : b
        );
        activeIndex = mostVisible[0];
        lastActiveIndex = activeIndex;
      } else if (lastActiveIndex !== null) {
        activeIndex = lastActiveIndex;
      }

      if (activeIndex !== null) {
        const activeLi = outlineList.querySelector(`li[data-heading-index="${activeIndex}"]`);
        if (activeLi) {
          activeLi.classList.add("active");
          const sidebar = document.getElementById("sidebar");
          const liTop = activeLi.offsetTop;
          const liBottom = liTop + activeLi.offsetHeight;
          const sidebarScrollTop = sidebar.scrollTop;
          const sidebarHeight = sidebar.clientHeight;

          if (liTop < sidebarScrollTop || liBottom > sidebarScrollTop + sidebarHeight) {
            activeLi.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }
      }
    },
    {
      root: contentArea,
      rootMargin: "-10% 0px -70% 0px",
      threshold: [0, 0.2, 0.5, 0.8, 1.0],
    }
  );

  headings.forEach((h) => {
    const el = document.getElementById("mkw-heading-" + h.index);
    if (el) headingObserver.observe(el);
  });
}

async function openFileDialog() {
  const path = await open({
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  if (path) openFileInNewTab(path);
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

function saveCommentsForFile() {
  if (!currentPath) return;
  const path = currentPath;
  const data = JSON.parse(JSON.stringify(commentsData));
  saveQueue = saveQueue
    .then(() => invoke("save_comments", { markdownPath: path, commentsData: data }))
    .then(() => {
      const banner = document.getElementById("save-error-banner");
      if (banner) banner.style.display = "none";
    })
    .catch((e) => {
      console.error("Failed to save comments:", e);
      const banner = document.getElementById("save-error-banner");
      if (banner) banner.style.display = "flex";
    });
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
  const tab = getActiveTab();
  if (tab) loadFileIntoTab(tab.id, tab.path);
});
document.getElementById("btn-open").addEventListener("click", openFileDialog);
document.getElementById("history-button").addEventListener("click", (e) => {
  const dropdown = document.getElementById("history-dropdown");
  if (dropdown.style.display === "block") {
    hideHistoryDropdown();
  } else {
    showHistoryDropdown();
  }
});

document.addEventListener("click", (e) => {
  const historyBtn = document.getElementById("history-button");
  const dropdown = document.getElementById("history-dropdown");
  if (!historyBtn.contains(e.target) && !dropdown.contains(e.target)) {
    hideHistoryDropdown();
  }
});

document.getElementById("toolbar").addEventListener("mousedown", (e) => {
  if (e.target.closest("button")) return;
  getCurrentWindow().startDragging();
});

document.getElementById("toolbar").addEventListener("dblclick", async (e) => {
  if (e.target.closest("button")) return;
  await getCurrentWindow().toggleMaximize();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" || e.code === "Escape") {
    const commentModal = document.getElementById("comment-modal");
    const reviewModal = document.getElementById("review-modal");
    const whisperModal = document.getElementById("whisper-settings-modal");

    if (commentModal && commentModal.style.display === "flex") {
      e.preventDefault();
      commentModal.style.display = "none";
      return;
    }

    if (reviewModal && reviewModal.style.display === "flex") {
      e.preventDefault();
      reviewModal.style.display = "none";
      return;
    }

    if (whisperModal && whisperModal.style.display === "flex") {
      e.preventDefault();
      hideModal("whisper-settings-modal");
      return;
    }
  }

  if ((e.metaKey || e.ctrlKey) && e.key === "w") {
    e.preventDefault();
    if (activeTabId) closeTab(activeTabId);
  }

  if ((e.metaKey || e.ctrlKey) && e.key === "Tab") {
    if (tabs.length === 0) return;

    e.preventDefault();
    const index = tabs.findIndex(t => t.id === activeTabId);

    if (e.shiftKey) {
      const prevTab = tabs[(index - 1 + tabs.length) % tabs.length];
      if (prevTab) switchToTab(prevTab.id);
    } else {
      const nextTab = tabs[(index + 1) % tabs.length];
      if (nextTab) switchToTab(nextTab.id);
    }
  }
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

listen("file-changed", async (event) => {
  const changedPath = event.payload;

  for (const tab of tabs.filter(t => t.path === changedPath)) {
    if (tab.id === activeTabId) {
      await loadFileIntoTab(tab.id, tab.path);
    } else {
      tab.content = null;
      tab.html = null;
      tab.headings = null;
    }
  }
});

// Voice-to-text recording state

const recordingBtn = document.getElementById("recording-btn");
let isRecording = false;
let currentShortcutLabel = "⌥Space";
let activeTranscriptionTarget = null;

listen("start-recording-shortcut", () => {
  isRecording = true;
});

listen("start-recording-button", () => {
  isRecording = true;
});

listen("stop-recording", () => {
  isRecording = false;
});

listen("transcription-complete", (event) => {
  isRecording = false;


  if (activeTranscriptionTarget && event.payload) {
    const textarea = document.getElementById(activeTranscriptionTarget);
    if (textarea) {
      const currentText = textarea.value;
      const separator = currentText && !currentText.endsWith('\n') ? ' ' : '';
      textarea.value = currentText + separator + event.payload;
      textarea.focus();
    }
    activeTranscriptionTarget = null;
  }
});

listen("recording-error", (event) => {
  console.error("Recording error:", event.payload);
  isRecording = false;
});

listen("transcription-error", (event) => {
  console.error("Transcription error:", event.payload);
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

    const strong = document.createElement("strong");
    strong.textContent = m.info.id;
    info.appendChild(strong);

    const desc = document.createElement("span");
    desc.className = "model-desc";
    desc.textContent = m.info.description;
    info.appendChild(desc);

    const actions = document.createElement("div");
    actions.className = "model-actions";

    if (m.downloaded) {
      const isActive = settings.active_model === m.info.id;
      const useBtn = document.createElement("button");
      useBtn.className = "btn" + (isActive ? " btn-primary" : "");
      useBtn.textContent = isActive ? "Active" : "Use";
      useBtn.disabled = isActive;
      useBtn.addEventListener("click", async () => {
        await invoke("set_active_model", { modelId: m.info.id });
        loadModelList();
      });
      actions.appendChild(useBtn);

      if (!isActive) {
        const delBtn = document.createElement("button");
        delBtn.className = "btn btn-danger";
        delBtn.textContent = "Delete";
        delBtn.addEventListener("click", async () => {
          await invoke("delete_model", { modelId: m.info.id });
          loadModelList();
        });
        actions.appendChild(delBtn);
      }
    } else {
      const dlBtn = document.createElement("button");
      dlBtn.className = "btn btn-primary";
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

document.addEventListener("DOMContentLoaded", () => {
  const deviceSelect = document.getElementById("device-select");
  if (deviceSelect) {
    deviceSelect.addEventListener("change", async (e) => {
      try {
        const deviceName = e.target.value || null;
        await invoke("set_audio_device", { deviceName });
      } catch (err) {
        console.error("Failed to set device:", err);
      }
    });
  }

  const thresholdInput = document.getElementById("threshold-input");
  if (thresholdInput) {
    thresholdInput.addEventListener("change", async (e) => {
      try {
        const settings = await invoke("get_whisper_settings");
        const raw = parseInt(e.target.value, 10);
        const value = Number.isFinite(raw) && raw > 0
          ? raw
          : (settings.long_recording_threshold || 60);
        settings.long_recording_threshold = value;
        e.target.value = value;
        await invoke("set_whisper_settings", { settings });
      } catch (err) {
        console.error("Failed to save threshold:", err);
      }
    });
  }
});

recordingBtn.addEventListener("click", async () => {
  const modelLoaded = await invoke("is_model_loaded");
  if (!modelLoaded) {
    openWhisperSettings();
    return;
  }

  try {
    await invoke("show_recording_window");
    await invoke("start_recording_button_mode");
  } catch (e) {
    console.error("Failed to start recording:", e);
  }
});

document.getElementById("whisper-settings-btn").addEventListener("click", () => {
  openWhisperSettings();
});

async function openWhisperSettings() {
  await loadModelList();

  try {
    const devices = await invoke("list_audio_devices");
    const deviceSelect = document.getElementById("device-select");
    deviceSelect.innerHTML = "";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "System Default";
    deviceSelect.appendChild(defaultOpt);
    devices.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.name;
      opt.textContent = `${d.name}${d.is_default ? " (Default)" : ""}`;
      deviceSelect.appendChild(opt);
    });

    const settings = await invoke("get_whisper_settings");
    if (settings.selected_device) {
      deviceSelect.value = settings.selected_device;
    }
  } catch (e) {
    console.error("Failed to load audio devices:", e);
  }

  const settings = await invoke("get_whisper_settings");
  document.getElementById("shortcut-input").value = settings.shortcut || "Alt+Space";
  document.getElementById("threshold-input").value = settings.long_recording_threshold || 60;
  showModal("whisper-settings-modal");
}

async function startRecordingForTextarea(textareaId) {
  const modelLoaded = await invoke("is_model_loaded");
  if (!modelLoaded) {
    openWhisperSettings();
    return;
  }

  try {
    activeTranscriptionTarget = textareaId;
    await invoke("show_recording_window");
    await invoke("start_recording_button_mode");
  } catch (e) {
    console.error("Failed to start recording:", e);
    activeTranscriptionTarget = null;
  }
}

document.getElementById("comment-mic-btn").addEventListener("click", () => {
  startRecordingForTextarea("comment-input");
});

document.getElementById("review-mic-btn").addEventListener("click", () => {
  startRecordingForTextarea("review-output");
});

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
  setTimeout(() => shortcutInput.focus(), 0);
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
    currentShortcutLabel = shortcut.replace("Alt", "⌥").replace("Ctrl", "⌃").replace("Shift", "⇧").replace("Super", "⌘").replaceAll("+", "");
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

listen("open-file", async (event) => {
  console.log("[DEBUG] open-file event received:", event.payload);
  await openFileInNewTab(event.payload);
  getCurrentWindow().show();
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
  await loadFileHistory();

  const initialFile = await invoke("get_initial_file");
  if (initialFile) {
    await openFileInNewTab(initialFile);
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
  document.getElementById("toolbar-title").textContent = "";
  document.getElementById("toolbar-info").style.display = "none";
} else {
  document.getElementById("toolbar-title").textContent = formatPath(currentPath);
  document.getElementById("toolbar-title").title = currentPath;
  document.getElementById("toolbar-info").style.display = "flex";
}

// Bottom bar and comment event listeners

document.getElementById("stale-banner-dismiss").addEventListener("click", hideStaleCommentsBanner);
document.getElementById("save-error-dismiss").addEventListener("click", () => {
  const banner = document.getElementById("save-error-banner");
  if (banner) banner.style.display = "none";
});

// Toggle button to expand/collapse
document.getElementById("bottom-bar-toggle").addEventListener("click", () => {
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
