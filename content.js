// content.js
// ======================== Config / Keys ======================================
const STATE_PREFIX = "gptc-open:"; // per-turn open/closed (session)
const ENABLED_KEY = "gptcEnabled"; // global on/off (sync storage)
const AUTO_COLLAPSE_KEY = "gptcAutoCollapse"; // auto-collapse setting
const KEEP_EXPANDED_KEY = "gptcKeepExpanded"; // how many to keep expanded
const TURN_SELECTOR = "section[data-turn]"; // Selector for message turn containers (update here if ChatGPT changes markup)

// ======================== State ==============================================
let enabled = true;
let autoCollapseEnabled = true;
let keepLastNExpanded = 10;
let observer = null;
let rescanIntervalId = null;
let observerTimeout = null;
let userExpandedIds = new Set(); // Track manually expanded messages
const detachedContent = new WeakMap(); // article element -> DocumentFragment of removed DOM nodes
let ownMutation = false; // true while we are making our own DOM changes

// ======================== Utilities ==========================================
function getTurnId(article) {
  // Always return the cached value — resolving live queries only before first detachment
  if (article.dataset.gptcId) return article.dataset.gptcId;
  const msgId = article.querySelector("[data-message-id]")?.getAttribute("data-message-id");
  const id = msgId || article.getAttribute("data-turn-id") || `gptc-${Math.random().toString(36).slice(2, 9)}`;
  article.dataset.gptcId = id; // cache immediately so detachment can't change the result
  return id;
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

// ======================== DOM Virtualization =================================
// Run fn() while telling the observer to ignore our own mutations
function withoutObserver(fn) {
  ownMutation = true;
  fn();
  // Reset after microtasks flush (MutationObserver callbacks fire as microtasks)
  setTimeout(() => { ownMutation = false; }, 0);
}

function detachContent(article) {
  if (detachedContent.has(article)) return; // already detached
  // Never detach the last (potentially streaming) turn
  const allTurns = document.querySelectorAll(TURN_SELECTOR);
  if (article === allTurns[allTurns.length - 1]) return;
  // Capture a fresh preview before removing content, in case the cached value is stale
  const fresh = extractPreviewText(article);
  if (fresh !== "(empty message)") {
    article.dataset.gptcPreview = fresh;
  }
  const frag = document.createDocumentFragment();
  while (article.firstChild) frag.appendChild(article.firstChild);
  detachedContent.set(article, frag);
}

function reattachContent(article) {
  const frag = detachedContent.get(article);
  if (!frag) return;
  article.appendChild(frag);
  detachedContent.delete(article);
}

// ======================== Performance: Auto-collapse Old ====================
function autoCollapseOld() {
  if (!autoCollapseEnabled) return;

  const articles = [...document.querySelectorAll(TURN_SELECTOR)];
  if (articles.length <= keepLastNExpanded) return;

  const toCollapse = articles.slice(0, -keepLastNExpanded);

  toCollapse.forEach((article) => {
    const id = getTurnId(article);

    // Don't auto-collapse if user manually expanded it
    if (userExpandedIds.has(id)) return;

    if (!article.classList.contains("gptc-collapsed")) {
      article.classList.add("gptc-collapsed");
      saveOpenState(id, false);
      detachContent(article);

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

  // Use cached preview when content is detached, otherwise extract and cache it
  let preview;
  if (detachedContent.has(article)) {
    preview = article.dataset.gptcPreview || "(no preview)";
  } else {
    preview = extractPreviewText(article);
    // Only cache real content — don't overwrite a good cached value with a temporary empty state
    if (preview !== "(empty message)") {
      article.dataset.gptcPreview = preview;
    } else if (article.dataset.gptcPreview) {
      preview = article.dataset.gptcPreview;
    }
  }

  // initial state: assistant open, user collapsed (or from session)
  let open = loadOpenState(id);
  if (open === null) open = role === "assistant";

  // apply collapsed class to article
  article.classList.toggle("gptc-collapsed", !open);

  // ensure an id so aria-controls can reference it
  if (!article.id) article.id = `gptc-article-${id}`;

  let row = article.previousElementSibling;
  const rowExists = hasSummaryRow(article);

  if (rowExists) {
    // Only update what actually changed — avoid full rebuild on every observer tick
    const expandedVal = open ? "true" : "false";
    if (row.getAttribute("aria-expanded") !== expandedVal) {
      row.setAttribute("aria-expanded", expandedVal);
    }
    const previewEl = row.querySelector(".gptc-preview");
    if (previewEl && previewEl.textContent !== preview) {
      previewEl.textContent = preview;
    }
  } else {
    row = document.createElement("div");
    row.className = "gptc-summary-row";
    row.setAttribute("role", "button");
    row.tabIndex = 0;
    article.parentNode.insertBefore(row, article);

    row.setAttribute("aria-controls", article.id);
    row.setAttribute("aria-expanded", open ? "true" : "false");

    const rolePill = document.createElement("span");
    rolePill.className = "gptc-role";
    const roleIcon = document.createElement("span");
    roleIcon.className = "gptc-role-icon";
    roleIcon.innerHTML = role === "assistant"
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" viewBox="0 0 256 256"><path d="M200,48H136V16a8,8,0,0,0-16,0V48H56A32,32,0,0,0,24,80V192a32,32,0,0,0,32,32H200a32,32,0,0,0,32-32V80A32,32,0,0,0,200,48Zm16,144a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V80A16,16,0,0,1,56,64H200a16,16,0,0,1,16,16Zm-52-56H92a28,28,0,0,0,0,56h72a28,28,0,0,0,0-56Zm-24,16v24H116V152ZM80,164a12,12,0,0,1,12-12h8v24H92A12,12,0,0,1,80,164Zm84,12h-8V152h8a12,12,0,0,1,0,24ZM72,108a12,12,0,1,1,12,12A12,12,0,0,1,72,108Zm88,0a12,12,0,1,1,12,12A12,12,0,0,1,160,108Z"></path></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" viewBox="0 0 256 256"><path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z"></path></svg>';
    rolePill.append(roleIcon, role);

    const previewSpan = document.createElement("span");
    previewSpan.className = "gptc-preview";
    previewSpan.textContent = preview;

    const chevron = document.createElement("span");
    chevron.className = "gptc-chevron";
    chevron.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6l-6 6z"/></svg>';

    row.append(rolePill, previewSpan, chevron);

    const toggle = () => {
      withoutObserver(() => {
        const willCollapse = !article.classList.contains("gptc-collapsed");
        if (!willCollapse) reattachContent(article);
        article.classList.toggle("gptc-collapsed");
        const isOpen = !willCollapse;
        if (willCollapse) detachContent(article);

        row.setAttribute("aria-expanded", isOpen ? "true" : "false");
        saveOpenState(id, isOpen);

        if (isOpen) {
          userExpandedIds.add(id);
        } else {
          userExpandedIds.delete(id);
        }
      });
    };

    row.onclick = toggle;
    row.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    };
  }

  // Sync DOM virtualization with current open/collapsed state
  if (!open) {
    detachContent(article); // no-op if already detached
  } else {
    reattachContent(article); // no-op if not detached
  }
}

// Scan existing articles without moving them
function scanExisting() {
  document.querySelectorAll(TURN_SELECTOR).forEach(createOrUpdateSummaryRow);
  autoCollapseOld();
}

function removeAllSummaryRows() {
  withoutObserver(() => {
    document.querySelectorAll(TURN_SELECTOR).forEach((article) => {
      reattachContent(article);
    });
    document.querySelectorAll(".gptc-summary-row").forEach((el) => el.remove());
    document.querySelectorAll(`${TURN_SELECTOR}.gptc-collapsed`).forEach((a) => a.classList.remove("gptc-collapsed"));
  });
}

// ======================== Bulk Actions =======================================
function collapseAll() {
  withoutObserver(() => {
    userExpandedIds.clear();
    document.querySelectorAll(TURN_SELECTOR).forEach((article) => {
      const id = getTurnId(article);
      article.classList.add("gptc-collapsed");
      saveOpenState(id, false);
      detachContent(article);

      const row = article.previousElementSibling;
      if (row?.classList?.contains("gptc-summary-row")) {
        row.setAttribute("aria-expanded", "false");
      }
    });
  });
}

function expandAll() {
  withoutObserver(() => {
    const articles = document.querySelectorAll(TURN_SELECTOR);
    articles.forEach((article) => {
      const id = getTurnId(article);
      reattachContent(article);
      article.classList.remove("gptc-collapsed");
      saveOpenState(id, true);
      userExpandedIds.add(id);

      const row = article.previousElementSibling;
      if (row?.classList?.contains("gptc-summary-row")) {
        row.setAttribute("aria-expanded", "true");
      }
    });
  });
}

// ======================== Observation Control (Throttled) ===================
function startObserving() {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    if (ownMutation || observerTimeout) return;

    observerTimeout = setTimeout(() => {
      withoutObserver(() => {
        for (const m of mutations) {
          // New turns arrive as added nodes or text updates
          m.addedNodes?.forEach((node) => {
            if (node.nodeType !== 1) return;
            if (node.matches?.(TURN_SELECTOR)) createOrUpdateSummaryRow(node);
            node.querySelectorAll?.(TURN_SELECTOR).forEach(createOrUpdateSummaryRow);
          });

          // If message text changes inside an article, refresh its preview
          if (m.type === "childList") {
            const a = m.target?.closest?.(TURN_SELECTOR);
            if (a) createOrUpdateSummaryRow(a);
          }
        }
        autoCollapseOld();
      });
      observerTimeout = null;
    }, 100); // Throttle to every 100ms
  });

  observer.observe(document.body, { childList: true, subtree: true });

  if (!rescanIntervalId) {
    rescanIntervalId = setInterval(() => {
      if (!enabled) return;
      // Use idle callback so the rescan never blocks user interaction
      const run = () => withoutObserver(() => scanExisting());
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(run, { timeout: 2000 });
      } else {
        run();
      }
    }, 10000); // 10s is plenty — the observer handles real-time updates
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

  const ready = () => !!document.querySelector(TURN_SELECTOR);
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
