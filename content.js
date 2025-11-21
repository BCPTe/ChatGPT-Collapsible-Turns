// content.js
// ======================== Config / Keys ======================================
const STATE_PREFIX = "gptc-open:"; // per-turn open/closed (session)
const ENABLED_KEY = "gptcEnabled"; // global on/off (sync storage)
const AUTO_COLLAPSE_KEY = "gptcAutoCollapse"; // auto-collapse setting
const KEEP_EXPANDED_KEY = "gptcKeepExpanded"; // how many to keep expanded

// ======================== State ==============================================
let enabled = true;
let autoCollapseEnabled = true;
let keepLastNExpanded = 10;
let observer = null;
let rescanIntervalId = null;
let observerTimeout = null;
let userExpandedIds = new Set(); // Track manually expanded messages

// ======================== Utilities ==========================================
function getTurnId(article) {
  const msgId = article.querySelector("[data-message-id]")?.getAttribute("data-message-id");
  if (msgId) return msgId;
  const turnId = article.getAttribute("data-turn-id");
  if (turnId) return turnId;
  return `dom-index-${[...document.querySelectorAll("article[data-turn]")].indexOf(article)}`;
}

function getRole(article) {
  return article.getAttribute("data-turn") || "turn";
}

function extractPreviewText(article, maxLen = 140) {
  const textNode = article.querySelector(".whitespace-pre-wrap") || article.querySelector("[data-message-author-role]") || article;
  let text = (textNode?.textContent || "").trim().replace(/\s+/g, " ");
  if (text.length > maxLen) text = text.slice(0, maxLen - 1) + "…";
  return text || "(empty message)";
}

function loadOpenState(id) {
  const v = sessionStorage.getItem(STATE_PREFIX + id);
  return v === null ? null : v === "1";
}

function saveOpenState(id, isOpen) {
  sessionStorage.setItem(STATE_PREFIX + id, isOpen ? "1" : "0");
}

// ======================== Performance: Auto-collapse Old ====================
function autoCollapseOld() {
  if (!autoCollapseEnabled) return;

  const articles = [...document.querySelectorAll("article[data-turn]")];
  if (articles.length <= keepLastNExpanded) return;

  const toCollapse = articles.slice(0, -keepLastNExpanded);

  toCollapse.forEach((article) => {
    const id = getTurnId(article);

    // Don't auto-collapse if user manually expanded it
    if (userExpandedIds.has(id)) return;

    if (!article.classList.contains("gptc-collapsed")) {
      article.classList.add("gptc-collapsed");
      saveOpenState(id, false);

      const row = article.previousElementSibling;
      if (row?.classList?.contains("gptc-summary-row")) {
        row.setAttribute("aria-expanded", "false");
      }
    }
  });
}

// ======================== Summary Row (non-reparenting) ======================
function hasSummaryRow(article) {
  const prev = article.previousElementSibling;
  return prev?.classList?.contains("gptc-summary-row");
}

function createOrUpdateSummaryRow(article) {
  if (!enabled) return;

  const role = getRole(article);
  const id = getTurnId(article);
  const preview = extractPreviewText(article);

  // initial state: assistant open, user collapsed (or from session)
  let open = loadOpenState(id);
  if (open === null) open = role === "assistant";

  // apply collapsed class to article
  article.classList.toggle("gptc-collapsed", !open);

  // ensure an id so aria-controls can reference it
  if (!article.id) article.id = `gptc-article-${id}`;

  let row = article.previousElementSibling;
  if (!hasSummaryRow(article)) {
    row = document.createElement("div");
    row.className = "gptc-summary-row";
    row.setAttribute("role", "button");
    row.tabIndex = 0;
    article.parentNode.insertBefore(row, article);
  }

  row.setAttribute("aria-controls", article.id);
  row.setAttribute("aria-expanded", open ? "true" : "false");
  row.innerHTML = "";

  const rolePill = document.createElement("span");
  rolePill.className = "gptc-role";
  rolePill.textContent = role;

  const previewSpan = document.createElement("span");
  previewSpan.className = "gptc-preview";
  previewSpan.textContent = preview;

  const chevron = document.createElement("span");
  chevron.className = "gptc-chevron";
  chevron.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6l-6 6z"/></svg>';

  row.append(rolePill, previewSpan, chevron);

  const toggle = () => {
    const isOpen = article.classList.toggle("gptc-collapsed") === false; // collapsed=false -> open
    row.setAttribute("aria-expanded", isOpen ? "true" : "false");
    saveOpenState(id, isOpen);

    // Track user-expanded messages
    if (isOpen) {
      userExpandedIds.add(id);
    } else {
      userExpandedIds.delete(id);
    }
  };

  row.onclick = toggle;
  row.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };
}

// Scan existing articles without moving them
function scanExisting() {
  document.querySelectorAll("article[data-turn]").forEach(createOrUpdateSummaryRow);
  autoCollapseOld();
}

function removeAllSummaryRows() {
  document.querySelectorAll(".gptc-summary-row").forEach((el) => el.remove());
  document.querySelectorAll("article[data-turn].gptc-collapsed").forEach((a) => a.classList.remove("gptc-collapsed"));
}

// ======================== Bulk Actions =======================================
function collapseAll() {
  userExpandedIds.clear(); // Clear user expansions when collapsing all
  document.querySelectorAll("article[data-turn]").forEach((article) => {
    const id = getTurnId(article);
    article.classList.add("gptc-collapsed");
    saveOpenState(id, false);

    const row = article.previousElementSibling;
    if (row?.classList?.contains("gptc-summary-row")) {
      row.setAttribute("aria-expanded", "false");
    }
  });
}

function expandAll() {
  const articles = document.querySelectorAll("article[data-turn]");
  articles.forEach((article) => {
    const id = getTurnId(article);
    article.classList.remove("gptc-collapsed");
    saveOpenState(id, true);
    userExpandedIds.add(id); // Mark all as user-expanded

    const row = article.previousElementSibling;
    if (row?.classList?.contains("gptc-summary-row")) {
      row.setAttribute("aria-expanded", "true");
    }
  });
}

// ======================== Observation Control (Throttled) ===================
function startObserving() {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    if (observerTimeout) return;

    observerTimeout = setTimeout(() => {
      for (const m of mutations) {
        // New turns arrive as added nodes or text updates
        m.addedNodes?.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches?.("article[data-turn]")) createOrUpdateSummaryRow(node);
          node.querySelectorAll?.("article[data-turn]").forEach(createOrUpdateSummaryRow);
        });

        // If message text changes inside an article, refresh its preview
        if (m.type === "childList" || m.type === "subtree") {
          const a = m.target?.closest?.("article[data-turn]");
          if (a) createOrUpdateSummaryRow(a);
        }
      }
      autoCollapseOld();
      observerTimeout = null;
    }, 100); // Throttle to every 100ms
  });

  observer.observe(document.body, { childList: true, subtree: true });

  if (!rescanIntervalId) {
    rescanIntervalId = setInterval(() => {
      if (enabled) {
        scanExisting();
      }
    }, 2000);
  }
}

function stopObserving() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (observerTimeout) {
    clearTimeout(observerTimeout);
    observerTimeout = null;
  }
  if (rescanIntervalId) {
    clearInterval(rescanIntervalId);
    rescanIntervalId = null;
  }
}

// ======================== Top Control Bar ====================================
function ensureTopBar() {
  if (document.getElementById("gptc-topbar")) return;

  const bar = document.createElement("div");
  bar.id = "gptc-topbar";
  bar.setAttribute("data-collapsed", "0");

  const content = document.createElement("div");
  content.className = "gptc-topbar-content";

  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.textContent = "Collapse All";
  collapseBtn.className = "gptc-topbar-btn";
  collapseBtn.addEventListener("click", collapseAll);

  const expandBtn = document.createElement("button");
  expandBtn.type = "button";
  expandBtn.textContent = "Expand All";
  expandBtn.className = "gptc-topbar-btn";
  expandBtn.addEventListener("click", expandAll);

  const autoCollapseToggle = document.createElement("button");
  autoCollapseToggle.type = "button";
  autoCollapseToggle.className = "gptc-topbar-btn gptc-auto-toggle";

  const renderAutoToggle = () => {
    autoCollapseToggle.textContent = autoCollapseEnabled ? `Auto-collapse: ON (keep ${keepLastNExpanded})` : "Auto-collapse: OFF";
    autoCollapseToggle.setAttribute("data-active", autoCollapseEnabled ? "1" : "0");
  };

  autoCollapseToggle.addEventListener("click", async () => {
    autoCollapseEnabled = !autoCollapseEnabled;
    renderAutoToggle();
    try {
      await chrome.storage.sync.set({ [AUTO_COLLAPSE_KEY]: autoCollapseEnabled });
    } catch (_) {}
    if (autoCollapseEnabled) autoCollapseOld();
  });

  const toggleBarBtn = document.createElement("button");
  toggleBarBtn.type = "button";
  toggleBarBtn.className = "gptc-topbar-toggle";
  toggleBarBtn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6l-6 6z"/></svg>';
  toggleBarBtn.setAttribute("aria-label", "Toggle toolbar");

  toggleBarBtn.addEventListener("click", () => {
    const isCollapsed = bar.getAttribute("data-collapsed") === "1";
    bar.setAttribute("data-collapsed", isCollapsed ? "0" : "1");
    sessionStorage.setItem("gptc-topbar-collapsed", isCollapsed ? "0" : "1");
  });

  renderAutoToggle();
  content.append(collapseBtn, expandBtn, autoCollapseToggle);
  bar.append(content, toggleBarBtn);
  document.body.appendChild(bar);

  // Restore collapsed state
  const savedState = sessionStorage.getItem("gptc-topbar-collapsed");
  if (savedState === "1") {
    bar.setAttribute("data-collapsed", "1");
  }
}

function removeTopBar() {
  document.getElementById("gptc-topbar")?.remove();
}

// ======================== Toggle Button UI ===================================
function ensureToggleButton() {
  if (document.getElementById("gptc-toggle")) return;

  const mount = document.createElement("div");
  mount.id = "gptc-toggle";

  const btn = document.createElement("button");
  btn.type = "button";

  const dot = document.createElement("span");
  dot.className = "dot";

  const label = document.createElement("span");
  label.textContent = "Collapsible: On";

  btn.append(dot, label);
  mount.appendChild(btn);
  document.body.appendChild(mount);

  const render = () => {
    mount.setAttribute("data-off", enabled ? "0" : "1");
    label.textContent = enabled ? "Collapsible: On" : "Collapsible: Off";
  };

  btn.addEventListener("click", async () => {
    await setEnabled(!enabled);
    render();
  });

  render();
}

// ======================== Enable/Disable Core ================================
async function setEnabled(next) {
  enabled = next;

  if (enabled) {
    scanExisting();
    startObserving();
    ensureTopBar();
  } else {
    stopObserving();
    removeAllSummaryRows();
    removeTopBar();
  }

  try {
    await chrome.storage.sync.set({ [ENABLED_KEY]: enabled });
  } catch (_) {}
}

async function loadSettings() {
  try {
    const data = await chrome.storage.sync.get([ENABLED_KEY, AUTO_COLLAPSE_KEY, KEEP_EXPANDED_KEY]);
    if (typeof data?.[ENABLED_KEY] === "boolean") enabled = data[ENABLED_KEY];
    if (typeof data?.[AUTO_COLLAPSE_KEY] === "boolean") autoCollapseEnabled = data[AUTO_COLLAPSE_KEY];
    if (typeof data?.[KEEP_EXPANDED_KEY] === "number") keepLastNExpanded = data[KEEP_EXPANDED_KEY];
  } catch (_) {}
}

try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (ENABLED_KEY in changes) {
      const next = !!changes[ENABLED_KEY].newValue;
      if (next !== enabled) setEnabled(next);
    }
    if (AUTO_COLLAPSE_KEY in changes) {
      autoCollapseEnabled = !!changes[AUTO_COLLAPSE_KEY].newValue;
    }
    if (KEEP_EXPANDED_KEY in changes) {
      keepLastNExpanded = changes[KEEP_EXPANDED_KEY].newValue || 10;
    }
  });
} catch (_) {}

// ======================== Boot ==============================================
(async function init() {
  await loadSettings();
  ensureToggleButton();

  const ready = () => !!document.querySelector("article[data-turn]");
  const go = () => {
    if (enabled) {
      scanExisting();
      startObserving();
      ensureTopBar();
    }
  };

  if (ready()) go();
  else {
    const int = setInterval(() => {
      if (ready()) {
        clearInterval(int);
        go();
      }
    }, 500);
  }
})();
