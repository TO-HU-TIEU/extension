/* Opt-in home-feed automation with a console dashboard. */
(() => {
  if (!globalThis.AutoBotMemory) {
    globalThis.AutoBotMemory = {
      startTime: Date.now(),
      processed: [],
      skipped: [],
      isPaused: false,
      speed: 0,
      consecutiveFailures: 0,
      sessionFailures: 0,
    };
  }
  const memory = globalThis.AutoBotMemory;
  const sendRuntimeMessage = (message, fallback = null) => {
    try {
      return Promise.resolve(chrome.runtime.sendMessage(message)).catch(() => fallback);
    } catch {
      return Promise.resolve(fallback);
    }
  };
  const isInvalidatedContext = (error) =>
    /extension context invalidated/i.test(String(error?.message || error || ""));
  const runtimeAssetUrl = (path) => {
    try {
      return chrome.runtime.getURL(path);
    } catch {
      return path;
    }
  };
  const syncPauseButton = () => {
    const button = document.querySelector("#assistant-auto-dashboard [data-auto-pause]");
    if (!button) return;
    button.innerHTML = memory.isPaused
      ? '<svg viewBox="0 0 12 14" aria-hidden="true" style="width:12px;height:14px;display:block;fill:currentColor"><path d="M2 1.1 11 7l-9 5.9z"></path></svg>'
      : '<svg viewBox="0 0 12 12" aria-hidden="true" style="width:12px;height:12px;display:block;fill:currentColor"><rect x="1.5" y="1.5" width="9" height="9" rx="1"></rect></svg>';
    button.style.background = memory.isPaused ? "#20c997" : "#d64555";
    button.setAttribute("aria-label", memory.isPaused ? "Tiếp tục" : "Tạm dừng");
    button.title = memory.isPaused ? "Tiếp tục" : "Tạm dừng";
    button.dataset.autoPauseState = memory.isPaused ? "paused" : "running";
  };
  const setPaused = (paused) => {
    const nextPaused = !!paused;
    if (nextPaused && !memory.isPaused && activeRunSegmentStartedAt) {
      activeRunElapsedMs = activeRunElapsed();
      activeRunSegmentStartedAt = 0;
    } else if (!nextPaused && memory.isPaused && running && !memory.isAutoResting) {
      activeRunSegmentStartedAt = Date.now();
    }
    memory.isPaused = nextPaused;
    memory.runState = memory.isPaused ? "paused" : running ? "running" : memory.runState;
    syncPauseButton();
    const status = document.querySelector("#assistant-auto-dashboard [data-auto-session-status]");
    if (status) {
      const elapsed = Math.floor((Date.now() - sessionStart) / 60000);
      status.textContent = memory.isAutoResting
        ? "● Nghỉ tự động"
        : memory.isPaused
          ? `● Tạm dừng (${elapsed} phút)`
          : `● ${running ? `Đang chạy (${elapsed} phút)` : "Đã dừng"}`;
    }
    console.log(`[Assistant Auto] ${memory.isPaused ? "Tạm dừng" : "Tiếp tục"}`);
    sendRuntimeMessage({
      type: "autoFlowPauseState",
      paused: memory.isPaused,
      runId: memory.runId,
    });
  };
  globalThis.toggleAutoBotPause = () => {
    if (memory.isPaused && !running) return resumeCurrentRun();
    setPaused(!memory.isPaused);
  };
  let running = false,
    timer = 0,
    sessionStart = 0,
    activeRunElapsedMs = 0,
    activeRunSegmentStartedAt = 0;
  const activeRunElapsed = () =>
      activeRunElapsedMs + (activeRunSegmentStartedAt ? Date.now() - activeRunSegmentStartedAt : 0),
    endAutoRest = () => {
      if (!memory.isAutoResting) return;
      memory.isAutoResting = false;
      memory.autoRestUntil = 0;
      activeRunElapsedMs = 0;
      activeRunSegmentStartedAt = memory.isPaused || !running ? 0 : Date.now();
      log("Hết thời gian nghỉ · tự động chạy tiếp");
      dashboard();
    },
    startAutoRestIfDue = () => {
      if (!running || memory.isPaused || memory.isAutoResting || !memory.autoRestEnabled) return;
      const intervalMs = Math.max(1, Number(memory.autoRestEveryMinutes) || 30) * 60_000;
      if (activeRunElapsed() < intervalMs) return;
      activeRunElapsedMs = intervalMs;
      activeRunSegmentStartedAt = 0;
      memory.isAutoResting = true;
      const restDurationMs = Math.round(intervalMs / 5),
        restDuration =
          restDurationMs % 60_000 === 0
            ? `${restDurationMs / 60_000} phút`
            : `${Math.ceil(restDurationMs / 1000)} giây`;
      memory.autoRestUntil = Date.now() + restDurationMs;
      log(`Tạm nghỉ tự động ${restDuration} sau ${memory.autoRestEveryMinutes} phút chạy`);
      dashboard();
    };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitIfPaused = async () => {
    while (running) {
      startAutoRestIfDue();
      if (memory.isAutoResting && Date.now() >= memory.autoRestUntil) endAutoRest();
      if (!memory.isPaused && !memory.isAutoResting) return true;
      if (memory.isAutoResting) {
        const status = document.querySelector(
          "#assistant-auto-dashboard [data-auto-session-status]",
        );
        if (status) {
          const remaining = Math.max(0, Math.ceil((memory.autoRestUntil - Date.now()) / 1000));
          status.textContent = `● Nghỉ tự động (${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")})`;
        }
      }
      await sleep(100);
    }
    return false;
  };
  const pauseSleep = async (ms) => {
    if (!(await waitIfPaused())) return false;
    let remaining = ms;
    while (remaining > 0) {
      if (!(await waitIfPaused())) return false;
      const step = Math.min(remaining, 100);
      await sleep(step);
      remaining -= step;
    }
    return running;
  };
  const log = (...a) => {
    const now = new Date();
    const stamp = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    const message = a.map(String).join(" ");
    memory.logs = [...(memory.logs || []), `${stamp} ${message}`];
    console.log("[Assistant Auto]", ...a);
    const list = document.querySelector("[data-auto-log-list]");
    if (list) {
      list.textContent = memory.logs.join("\n") || "Đang chờ bài tiếp theo";
      list.scrollTop = list.scrollHeight;
    }
  };
  ((read = (k) => {
    try {
      return JSON.parse(localStorage.getItem(k) || "[]");
    } catch {
      return [];
    }
  }),
    (save = (k, v) => localStorage.setItem(k, JSON.stringify(v))),
    (postId = (a) =>
      a?.querySelector('a[href*="/status/"]')?.href.match(/\/status\/(\d+)/)?.[1] || ""),
    (own = () =>
      document
        .querySelector('[data-testid^="UserAvatar-Container-"]')
        ?.getAttribute("data-testid")
        ?.replace("UserAvatar-Container-", "")
        .toLowerCase() || ""));
  const excludedAuthorSet = async () => {
    try {
      const stored = await chrome.storage.local.get("autoReplyExcludedAuthors");
      return new Set(
        (Array.isArray(stored.autoReplyExcludedAuthors) ? stored.autoReplyExcludedAuthors : [])
          .map((value) =>
            String(value || "")
              .trim()
              .replace(/^@/u, "")
              .toLowerCase(),
          )
          .filter((handle) => /^[a-z0-9_]{1,15}$/u.test(handle)),
      );
    } catch {
      return new Set();
    }
  };
  const createRunId = () => {
    // Keep run IDs independent from extension APIs so a stale content script
    // can still finish its local cleanup after the extension is reloaded.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  };
  const runStorageKey = (runId, kind) => `assistantAutoRun:${runId}:${kind}`;
  if (!memory.runId) memory.runId = createRunId();
  let processedKey = runStorageKey(memory.runId, "processed");
  let skippedKey = runStorageKey(memory.runId, "skipped");
  const notifyPanel = (enabled) =>
    sendRuntimeMessage({ type: "autoFlowState", enabled, runId: memory.runId });
  const coordinate = (action, item) =>
    sendRuntimeMessage(
      {
        type: "autoFlowCoordination",
        action,
        accountKey: own() || "unknown",
        postId: item?.id,
        runId: memory.runId,
        speed: Number(memory.speed || 0),
        minGapMs: Number(memory.autoMinGapMs || 0),
      },
      { data: { granted: false, reason: "coordinator-unavailable" } },
    ).then((response) => response?.data || { granted: false, reason: "no-coordinator-response" });
  if (!globalThis.__assistantAutoErrorLogging) {
    globalThis.__assistantAutoErrorLogging = true;
    window.addEventListener("error", (event) => {
      if (isInvalidatedContext(event.error || event.message)) {
        event.preventDefault();
        running = false;
        clearTimeout(timer);
        return;
      }
      log("Lỗi:", event.error?.message || event.message || "JavaScript error");
    });
    window.addEventListener("unhandledrejection", (event) => {
      if (isInvalidatedContext(event.reason)) {
        event.preventDefault();
        running = false;
        clearTimeout(timer);
        return;
      }
      log("Lỗi:", event.reason?.message || event.reason || "Promise rejection");
    });
  }
  const clearCurrentProcessing = () => {
    memory.logs = [];
    const current = document.querySelector("[data-auto-current-log]");
    const list = document.querySelector("[data-auto-log-list]");
    if (current) current.textContent = "Đang chờ bài tiếp theo";
    if (list) list.textContent = "Đang chờ bài tiếp theo";
  };
  const hasVietnamese = (text) => {
    const value = String(text || "");
    const marks = value.match(/[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/giu) || [];
    return (
      marks.length >= 2 || /\b(và|của|cho|được|không|một|những|này|đang|với|trong)\b/iu.test(value)
    );
  };
  const isVietnamesePost = (article) => {
    const textNode = article.querySelector('[data-testid="tweetText"]');
    const langNode = textNode?.closest("[lang]") || textNode?.querySelector("[lang]");
    const lang = langNode?.getAttribute("lang")?.toLowerCase();
    const text = textNode?.textContent || "";
    if (lang && !(lang === "vi" || lang.startsWith("vi-"))) return false;
    return hasVietnamese(text);
  };
  const flowDelay = (ms) => {
    const speed = Number(memory.speed || 0);
    const jitter = 0.86 + Math.random() * 0.28;
    // Slow the baseline by another 10%; the slider still applies its relative
    // adjustment on top of this baseline.
    return Math.max(350, Math.round(ms * 1.1781 * (1 - speed * 0.12) * jitter));
  };
  const readMinimumGapSetting = () => {
    const value = Math.max(
        0,
        Math.min(86_400, Number(localStorage.getItem("assistantAutoMinGapValue")) || 30),
      ),
      unit = localStorage.getItem("assistantAutoMinGapUnit") === "minutes" ? "minutes" : "seconds";
    memory.autoMinGapMs = value * (unit === "minutes" ? 60_000 : 1_000);
    return { value, unit };
  };
  const configureMinimumGapControl = (box) => {
    if (box.querySelector("[data-auto-min-gap-control]")) return;
    const speedInput = box.querySelector("[data-auto-speed]"),
      speedWrap = speedInput?.parentElement;
    if (!speedWrap) return;
    const setting = document.createElement("div");
    setting.dataset.autoMinGapControl = "";
    setting.style.cssText =
      "display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 0 4px;color:var(--xra-text,#edf1f5);font-size:14px";
    const label = document.createElement("b");
    label.textContent = "Thời gian giãn cách tối thiểu";
    label.style.flex = "1 1 100%";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "86400";
    input.step = "1";
    input.dataset.autoMinGapValue = "";
    input.setAttribute("aria-label", "Giá trị thời gian giãn cách tối thiểu");
    input.style.cssText =
      "width:76px;padding:6px 7px;border:1px solid var(--xra-border,#303842);border-radius:7px;background:var(--xra-bg,#000);color:var(--xra-text,#e7e9ea);font:inherit";
    const select = document.createElement("select");
    select.dataset.autoMinGapUnit = "";
    select.setAttribute("aria-label", "Đơn vị thời gian giãn cách tối thiểu");
    select.append(new Option("Giây", "seconds"), new Option("Phút", "minutes"));
    select.style.cssText =
      "padding:6px 24px 6px 7px;border:1px solid var(--xra-border,#303842);border-radius:7px;background:var(--xra-bg,#000);color:var(--xra-text,#e7e9ea);font:inherit";
    const sync = () => {
      const value = Math.max(0, Math.min(86_400, Number(input.value) || 0));
      input.value = String(value);
      const unit = select.value === "minutes" ? "minutes" : "seconds";
      localStorage.setItem("assistantAutoMinGapValue", String(value));
      localStorage.setItem("assistantAutoMinGapUnit", unit);
      memory.autoMinGapMs = value * (unit === "minutes" ? 60_000 : 1_000);
    };
    const saved = readMinimumGapSetting();
    input.value = String(saved.value);
    select.value = saved.unit;
    input.addEventListener("change", sync);
    select.addEventListener("change", sync);
    setting.append(label, input, select);
    speedWrap.after(setting);
  };
  const domHasOwnReply = (handle) => {
    if (!handle) return false;
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    return articles
      .slice(1)
      .some((article) =>
        article
          .querySelector('[data-testid="User-Name"]')
          ?.textContent?.toLowerCase()
          .includes(handle.toLowerCase()),
      );
  };
  async function submitSelectedReply(expectedText, handle) {
    const normalize = (value) =>
      String(value || "")
        .replace(/\s+/gu, " ")
        .trim();
    const expected = normalize(expectedText);
    let editor = null;
    let send = null;
    for (let attempt = 0; attempt < 30 && running; attempt++) {
      if (domHasOwnReply(handle)) return true;
      editor = document.querySelector('[data-testid^="tweetTextarea_"][contenteditable="true"]');
      const editorText = normalize(editor?.innerText || editor?.textContent);
      if (editor && expected && editorText.includes(expected)) {
        const scope = editor.closest('[role="dialog"]') || editor.closest("article") || document;
        send = scope.querySelector(
          '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]',
        );
        if (!send)
          send = document.querySelector(
            '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]',
          );
        if (send && !send.disabled) break;
      }
      await pauseSleep(250);
    }
    if (!running || !editor || !send || send.disabled) return false;
    send.click();
    for (let attempt = 0; attempt < 32 && running; attempt++) {
      await pauseSleep(250);
      const remaining = normalize(editor.innerText || editor.textContent);
      if (!remaining || domHasOwnReply(handle)) return true;
    }
    return false;
  }
  async function returnHome() {
    if (location.href.includes("/home") || location.pathname === "/") return true;
    const home = document.querySelector('a[data-testid="AppTabBar_Home_Link"]');
    if (home) {
      home.click();
      await pauseSleep(700);
      home.click();
    } else history.back();
    for (let i = 0; i < 16; i++) {
      await pauseSleep(500);
      if (location.href.includes("/home") || location.pathname === "/") {
        return true;
      }
    }
    return false;
  }
  function dashboard() {
    const p = read(processedKey),
      s = read(skippedKey),
      mins = Math.max(1, Math.floor((Date.now() - sessionStart) / 60000)),
      d = new Date(sessionStart),
      stamp = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      title = `[DANH SÁCH] Hoàn thành: ${p.length} | Bỏ qua: ${s.length} | Bắt đầu: ${stamp} | Trung bình: ${(p.length / mins).toFixed(2)} trả lời/phút`;
    console.clear();
    console.groupCollapsed(`${title} (Click để xem chi tiết)`);
    console.log("Danh sách hoàn thành:");
    console.table(p);
    console.log("Danh sách bỏ qua:");
    console.table(s);
    console.groupEnd();
    const box = document.getElementById("assistant-auto-dashboard");
    if (!box) return;
    const miniBadge = box.querySelector("[data-auto-mini-badge]");
    if (miniBadge) {
      const rate = (p.length / mins)
        .toFixed(2)
        .replace(/\.00$/, "")
        .replace(/(\.\d)0$/, "$1");
      const rateNode = miniBadge.querySelector("[data-auto-mini-rate]"),
        doneNode = miniBadge.querySelector("[data-auto-mini-done]"),
        skippedNode = miniBadge.querySelector("[data-auto-mini-skipped]");
      if (rateNode) rateNode.textContent = `${rate}/p`;
      if (doneNode) doneNode.textContent = String(p.length);
      if (skippedNode) skippedNode.textContent = String(s.length);
      return;
    }
    const formatCompletedAt = (value) => {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      return ` - ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
    };
    const elapsed = Math.floor((Date.now() - sessionStart) / 60000);
    const stats = box.querySelector("[data-auto-stats]");
    if (!stats) return;
    stats.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px"><div style="display:grid;grid-template-columns:34% 66%;align-items:stretch;min-height:76px;padding:0;border-radius:10px;overflow:hidden;background:transparent;border:1px solid var(--xra-border,#303842)"><span style="display:grid;place-items:center;font-size:25px;color:#35a7ee">↗</span><span style="display:flex;flex-direction:column;justify-content:center;padding:7px"><strong style="display:block;font-size:22px;color:#35a7ee">${(p.length / mins).toFixed(2)}</strong><small style="display:block;color:var(--xra-muted,#9aa4af)">trả lời/phút</small></span></div><div style="display:grid;grid-template-columns:34% 66%;align-items:stretch;min-height:76px;padding:0;border-radius:10px;overflow:hidden;background:var(--xra-panel,#202832);border:1px solid var(--xra-border,#303842)"><span style="display:grid;place-items:center;font-size:25px;color:#20c997">✓</span><span style="display:flex;flex-direction:column;justify-content:center;padding:7px"><strong style="display:block;font-size:22px;color:#20c997">${p.length}</strong><small style="display:block;color:var(--xra-muted,#9aa4af)">Hoàn thành</small></span></div><div style="display:grid;grid-template-columns:34% 66%;align-items:stretch;min-height:76px;padding:0;border-radius:10px;overflow:hidden;background:var(--xra-panel,#202832);border:1px solid var(--xra-border,#303842)"><span style="display:grid;place-items:center;font-size:25px;color:#ff5864">×</span><span style="display:flex;flex-direction:column;justify-content:center;padding:7px"><strong style="display:block;font-size:22px;color:#ff5864">${s.length}</strong><small style="display:block;color:var(--xra-muted,#9aa4af)">Bỏ qua</small></span></div></div>`;
    box
      .querySelectorAll("[data-auto-stats] > div > div")
      .forEach((card) => card.style.setProperty("background", "transparent", "important"));
    const sessionStatus = box.querySelector("[data-auto-session-status]");
    if (sessionStatus)
      sessionStatus.textContent = memory.isAutoResting
        ? "● Nghỉ tự động"
        : memory.isPaused
          ? `● Tạm dừng (${elapsed} phút)`
          : `● ${running ? `Đang chạy (${elapsed} phút)` : "Đã dừng"}`;
    const processedList = box.querySelector("[data-auto-list]");
    if (processedList) {
      processedList.style.maxHeight = "280px";
      processedList.style.overflowY = "auto";
      processedList.style.overflowX = "hidden";
      processedList.__autoItems = p.slice().reverse();
      processedList.__autoRender = () => {
        const items = processedList.__autoItems || [],
          shown = Math.min(Number(processedList.dataset.rendered || 10), items.length);
        processedList.innerHTML =
          items
            .slice(0, shown)
            .map(
              (x) =>
                `<button data-auto-url="${String(x.url).replace(/"/g, "&quot;")}" style="display:block;width:100%;margin:0;padding:7px 0;border:0;border-bottom:1px solid var(--xra-border,#303842);border-radius:0;background:transparent;color:#1d9bf0;text-align:left;font-size:13px;cursor:pointer">${x.displayName || x.handle || "Tên không xác định"} (@${x.handle || "user"})${formatCompletedAt(x.completedAt)}</button>`,
            )
            .join("") || "<small>Chưa có bài đã xử lý</small>";
        processedList.querySelectorAll("[data-auto-url]").forEach(
          (b) =>
            (b.onclick = () => {
              location.href = b.dataset.autoUrl;
            }),
        );
      };
      if (processedList.dataset.total !== String(processedList.__autoItems.length)) {
        processedList.dataset.total = String(processedList.__autoItems.length);
        processedList.dataset.rendered = String(Math.min(10, processedList.__autoItems.length));
        processedList.scrollTop = 0;
      }
      if (!processedList.dataset.lazyBound) {
        processedList.dataset.lazyBound = "true";
        processedList.addEventListener("scroll", () => {
          if (
            processedList.scrollTop + processedList.clientHeight >=
            processedList.scrollHeight - 24
          ) {
            processedList.dataset.rendered = String(
              Math.min(
                Number(processedList.dataset.rendered || 10) + 10,
                (processedList.__autoItems || []).length,
              ),
            );
            processedList.__autoRender?.();
          }
        });
      }
      processedList.__autoRender();
    }
    const processedCount = box.querySelector("[data-auto-processed-count]");
    if (processedCount)
      processedCount.textContent = `: ${p.length + s.length} (Hoàn thành ${p.length} | Bỏ qua ${s.length})`;
    const currentLog = box.querySelector("[data-auto-log-list]");
    if (currentLog) {
      currentLog.textContent = (memory.logs || []).join("\n") || "Đang chờ bài tiếp theo";
      currentLog.scrollTop = currentLog.scrollHeight;
    }
    box.querySelectorAll("[data-auto-url]").forEach(
      (b) =>
        (b.onclick = () => {
          location.href = b.dataset.autoUrl;
        }),
    );
    syncPauseButton();
  }
  function configureSpeedControl(box) {
    const input = box?.querySelector("[data-auto-speed]");
    if (!input) return;
    input.min = "-5";
    input.max = "5";
    input.step = "0.5";
    const marks = input.nextElementSibling;
    if (marks)
      marks.innerHTML =
        "<span>-5</span><span>-2.5</span><span>0</span><span>2.5</span><span>5</span>";
    input.value = String(
      Math.max(
        -5,
        Math.min(5, Number(localStorage.getItem("assistantAutoSpeed") || memory.speed || 0)),
      ),
    );
    memory.speed = Number(input.value);
    const output = box.querySelector("[data-auto-speed-value]");
    if (output) output.textContent = String(memory.speed);
  }
  function dashboardView() {
    let box = document.getElementById("assistant-auto-dashboard");
    if (box) {
      configureSpeedControl(box);
      configureMinimumGapControl(box);
      syncPauseButton();
      return box;
    }
    box = document.createElement("aside");
    box.id = "assistant-auto-dashboard";
    box.style.cssText =
      "--xra-text:var(--xra-color,#e7e9ea);--xra-border:color-mix(in srgb,var(--xra-color,#e7e9ea) 22%,var(--xra-bg,#000));--xra-muted:color-mix(in srgb,var(--xra-color,#e7e9ea) 60%,var(--xra-bg,#000));position:fixed;right:16px;top:78px;width:min(460px,calc(100vw - 24px));min-width:min(320px,calc(100vw - 24px));min-height:min(280px,calc(100vh - 24px));max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);resize:both;overflow:auto;z-index:2147483647;background:var(--xra-bg,#000);color:var(--xra-color,#e7e9ea);border:1px solid var(--xra-border);border-radius:16px;box-shadow:0 8px 24px #0004;font:13px/1.45 var(--xra-font,system-ui);padding:16px";
    box.innerHTML =
      '<div data-auto-drag-handle style="display:flex;align-items:center;gap:8px;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid var(--xra-border,#303842);cursor:move;touch-action:none"><span style="display:flex;align-items:center;gap:8px"><img src="' +
      runtimeAssetUrl("assets/logo.svg") +
      '" alt="Assistant" style="width:28px;height:28px"><strong style="font-size:17px;color:var(--xra-text,#edf1f5)">Tự động</strong></span><span style="display:flex;gap:6px"><button data-auto-pause aria-label="Tạm dừng" title="Tạm dừng" style="width:36px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;line-height:0;border:1px solid var(--xra-border,#303842);border-radius:8px;background:#d64555;color:#fff;cursor:pointer;font:700 13px system-ui"><svg viewBox="0 0 12 12" aria-hidden="true" style="width:12px;height:12px;display:block;fill:currentColor"><rect x="1.5" y="1.5" width="9" height="9" rx="1"></rect></svg></button><button data-auto-minimize aria-label="Thu nhỏ" title="Thu nhỏ" style="width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;line-height:1;border:1px solid var(--xra-border,#303842);border-radius:8px;background:transparent;color:inherit;cursor:pointer;font-size:20px">−</button><button data-auto-close aria-label="Đóng dashboard" title="Đóng dashboard" style="width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;line-height:1;border:1px solid var(--xra-border,#303842);border-radius:8px;background:transparent;color:inherit;cursor:pointer;font-size:20px">×</button></span></div><h3 style="margin:12px 0 5px;font-size:17px">Thiết lập</h3><div style="padding:8px 0 4px"><div style="display:flex;justify-content:space-between;font-size:15px"><b>Tốc độ xử lý</b><output data-auto-speed-value>0</output></div><input data-auto-speed type="range" min="-3" max="3" step="0.5" value="0" style="width:100%;accent-color:var(--xra-accent,#1d9bf0)"><div style="display:flex;justify-content:space-between;color:var(--xra-muted,#9aa4af);font-size:11px"><span>-3</span><span>-1.5</span><span>0</span><span>1.5</span><span>3</span></div></div><label style="display:flex;align-items:center;gap:8px;padding:8px 0;color:var(--xra-text,#edf1f5);font-size:15px"><input data-auto-vietnamese type="checkbox" checked> Chỉ xử lý bài có nội dung tiếng Việt</label><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:10px 0 5px"><h3 style="margin:0;font-size:17px">Thông tin phiên</h3><span data-auto-session-status style="color:#20c997;font-size:12px;white-space:nowrap">● Đang chạy (0 phút)</span></div><div data-auto-stats style="font-size:16px;margin:6px 0 10px;color:var(--xra-muted,#9aa4af);padding:4px 0"></div><div style="padding:12px;border:1px solid var(--xra-border,#303842);border-radius:10px;margin-bottom:10px;font-size:14px"><b style="display:flex;align-items:center"><span style="color:#20c997;font-size:10px;margin-right:4px">●</span> Đang xử lý <span data-auto-current-toggle style="margin-left:auto;font-size:16px;line-height:1">⌄</span></b><div data-auto-log-list style="margin-top:7px;max-height:none;overflow:visible;white-space:pre-wrap;font:13px/1.5 system-ui;color:var(--xra-muted,#9aa4af)">Đang chờ bài tiếp theo</div></div><details style="margin-top:12px"><summary style="font-size:14px;font-weight:700;list-style:none;display:flex;justify-content:flex-start;align-items:center;gap:4px;padding:8px 0;border-bottom:1px solid var(--xra-border,#303842);cursor:pointer">Đã xử lý <span data-auto-processed-count></span><span style="margin-left:auto;font-size:16px;line-height:1">⌄</span></summary><div data-auto-list style="max-height:none;overflow:visible;padding:4px 0;background:transparent;font-size:13px"></div></details><button data-auto-reset style="width:100%;margin-top:12px;padding:9px;border:1px solid var(--xra-border,#303842);border-radius:9px;background:transparent;color:inherit;cursor:pointer;font:600 14px system-ui">Reset số liệu</button>';
    const vietnameseFilter = box.querySelector("[data-auto-vietnamese]")?.closest("label");
    if (vietnameseFilter) {
      const restRow = document.createElement("label");
      restRow.dataset.autoRestRow = "";
      restRow.style.cssText =
        "display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 0;color:var(--xra-text,#edf1f5);font-size:15px";
      const enabled = document.createElement("input");
      enabled.type = "checkbox";
      enabled.dataset.autoRest = "";
      enabled.checked = localStorage.getItem("assistantAutoRestEnabled") === "true";
      const interval = document.createElement("input");
      interval.type = "number";
      interval.min = "1";
      interval.max = "1440";
      interval.step = "1";
      interval.dataset.autoRestInterval = "";
      interval.value = String(
        Math.max(
          1,
          Math.min(1440, Number(localStorage.getItem("assistantAutoRestEveryMinutes")) || 30),
        ),
      );
      interval.setAttribute("aria-label", "Số phút giữa các lần nghỉ");
      interval.style.cssText =
        "width:68px;padding:5px 7px;border:1px solid var(--xra-border,#303842);border-radius:7px;background:var(--xra-bg,#000);color:var(--xra-text,#e7e9ea);font:inherit";
      restRow.append(enabled, document.createTextNode("Tạm nghỉ (sau mỗi "), interval);
      restRow.append(document.createTextNode(" phút)"));
      vietnameseFilter.before(restRow);
      const syncRestSettings = () => {
        const everyMinutes = Math.max(1, Math.min(1440, Number(interval.value) || 30));
        interval.value = String(everyMinutes);
        memory.autoRestEnabled = enabled.checked;
        memory.autoRestEveryMinutes = everyMinutes;
        localStorage.setItem("assistantAutoRestEnabled", String(enabled.checked));
        localStorage.setItem("assistantAutoRestEveryMinutes", String(everyMinutes));
        if (!enabled.checked && memory.isAutoResting) {
          memory.isAutoResting = false;
          memory.autoRestUntil = 0;
          activeRunElapsedMs = 0;
          activeRunSegmentStartedAt = memory.isPaused || !running ? 0 : Date.now();
          log("Đã tắt nghỉ tự động · tiếp tục chạy");
          dashboard();
        }
      };
      memory.autoRestEnabled = enabled.checked;
      memory.autoRestEveryMinutes = Number(interval.value);
      enabled.addEventListener("change", syncRestSettings);
      interval.addEventListener("change", syncRestSettings);
    }
    document.documentElement.appendChild(box);
    configureSpeedControl(box);
    configureMinimumGapControl(box);
    const tabBadge = document.createElement("span");
    memory.tabBadge ||= Math.random().toString(36).slice(2, 6).toUpperCase();
    tabBadge.dataset.autoTabBadge = "";
    tabBadge.textContent = `TAB · ${memory.tabBadge}`;
    tabBadge.title = `Nhận diện tab hiện tại · ${location.hostname}`;
    tabBadge.style.cssText =
      "margin-left:4px;padding:3px 7px;border:1px solid color-mix(in srgb,#1d9bf0 60%,var(--xra-border,#303842));border-radius:999px;color:#35a7ee;font:600 10px/1 system-ui;white-space:nowrap";
    box.querySelector("[data-auto-drag-handle] > span")?.append(tabBadge);
    const setupTitle = [...box.querySelectorAll("h3")].find(
      (node) => node.textContent.trim() === "Thiết lập",
    );
    if (setupTitle) {
      const setupCard = document.createElement("section");
      setupCard.style.cssText =
        "padding:12px;border:1px solid var(--xra-border);border-radius:10px;background:transparent;margin-bottom:12px";
      setupTitle.parentNode.insertBefore(setupCard, setupTitle);
      setupCard.append(
        setupTitle,
        setupTitle.nextElementSibling,
        setupTitle.nextElementSibling?.nextElementSibling,
        setupTitle.nextElementSibling?.nextElementSibling?.nextElementSibling,
      );
    }
    const sessionRow = [...box.querySelectorAll("h3")].find(
      (node) => node.textContent.trim() === "Thông tin phiên",
    )?.parentElement;
    if (sessionRow) {
      const sessionCard = document.createElement("section");
      sessionCard.style.cssText =
        "padding:12px;border:1px solid var(--xra-border);border-radius:10px;background:transparent";
      sessionRow.parentNode.insertBefore(sessionCard, sessionRow);
      sessionCard.append(
        sessionRow,
        sessionRow.nextElementSibling,
        sessionRow.nextElementSibling?.nextElementSibling,
        sessionRow.nextElementSibling?.nextElementSibling?.nextElementSibling,
      );
    }
    box.querySelector("[data-auto-reset]")?.remove();
    box.querySelectorAll("[data-auto-stats] > div > div").forEach((card) => {
      card.style.setProperty("background", "transparent", "important");
    });
    const speedStyle = document.createElement("style");
    speedStyle.textContent =
      "#assistant-auto-dashboard [data-auto-speed]{accent-color:var(--xra-accent,var(--xra-color,#1d9bf0));color-scheme:light dark;background:transparent}#assistant-auto-dashboard [data-auto-speed]::-webkit-slider-runnable-track{height:4px;border-radius:4px;background:color-mix(in srgb,var(--xra-color,#e7e9ea) 28%,var(--xra-bg,#000))}#assistant-auto-dashboard [data-auto-speed]::-webkit-slider-thumb{margin-top:-5px;width:14px;height:14px;border:0;border-radius:50%;background:var(--xra-accent,#1d9bf0);-webkit-appearance:none}#assistant-auto-dashboard [data-auto-speed]::-moz-range-track{height:4px;border-radius:4px;background:color-mix(in srgb,var(--xra-color,#e7e9ea) 28%,var(--xra-bg,#000))}#assistant-auto-dashboard [data-auto-speed]::-moz-range-progress{height:4px;border-radius:4px;background:var(--xra-accent,#1d9bf0)}#assistant-auto-dashboard [data-auto-speed]::-moz-range-thumb{width:14px;height:14px;border:0;border-radius:50%;background:var(--xra-accent,#1d9bf0)}";
    box.appendChild(speedStyle);
    const processedCard = box.querySelector("details");
    if (processedCard) {
      processedCard.style.cssText =
        "margin-top:12px;padding:12px;border:1px solid var(--xra-border,#303842);border-radius:10px;background:transparent";
      const summary = processedCard.querySelector("summary");
      if (summary) summary.style.padding = "0 0 8px";
    }
    box.style.width = "min(460px, calc(100vw - 24px))";
    box.style.maxHeight = "calc(100vh - 24px)";
    box.style.minWidth = "min(320px, calc(100vw - 24px))";
    box.style.minHeight = "min(280px, calc(100vh - 24px))";
    box.style.resize = "both";
    box.style.overflow = "auto";
    const dropdownSvg = globalThis.AssistantIcons?.svg?.("dropdown");
    if (dropdownSvg)
      box.querySelectorAll("span").forEach((span) => {
        if (span.textContent.trim() === "⌄") span.innerHTML = dropdownSvg;
      });
    const makeDraggable = (
      dragHandle,
      allowInteractive = dragHandle?.matches("[data-auto-restore]"),
    ) => {
      if (allowInteractive && dragHandle) {
        dragHandle.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:20px;height:20px;display:block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"></path></svg>';
        dragHandle.style.cssText =
          "display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;padding:0;border:1px solid var(--xra-border);border-radius:50%;background:var(--xra-bg);color:var(--xra-color);cursor:move;line-height:0";
      }
      let dragState = null;
      let dragMoved = false;
      dragHandle?.addEventListener("pointerdown", (event) => {
        if (!allowInteractive && event.target.closest("button, input, select, textarea, a")) return;
        dragState = {
          x: event.clientX - box.offsetLeft,
          y: event.clientY - box.offsetTop,
          startX: event.clientX,
          startY: event.clientY,
        };
        dragMoved = false;
        dragHandle.dataset.autoDragMoved = "false";
        dragHandle.setPointerCapture?.(event.pointerId);
      });
      dragHandle?.addEventListener("pointermove", (event) => {
        if (!dragState) return;
        if (
          Math.abs(event.clientX - dragState.startX) + Math.abs(event.clientY - dragState.startY) >
          4
        )
          dragMoved = true;
        box.style.left = `${Math.max(0, event.clientX - dragState.x)}px`;
        box.style.top = `${Math.max(0, event.clientY - dragState.y)}px`;
        box.style.right = "auto";
      });
      dragHandle?.addEventListener("pointerup", () => {
        if (dragHandle) dragHandle.dataset.autoDragMoved = dragMoved ? "true" : "false";
        dragState = null;
      });
      dragHandle?.addEventListener("pointercancel", () => {
        if (dragHandle) dragHandle.dataset.autoDragMoved = dragMoved ? "true" : "false";
        dragState = null;
      });
    };
    makeDraggable(box.querySelector("[data-auto-drag-handle]"));
    const speedInput = box.querySelector("[data-auto-speed]");
    speedInput.oninput = (event) => {
      memory.speed = Number(event.target.value);
      localStorage.setItem("assistantAutoSpeed", String(memory.speed));
      box.querySelector("[data-auto-speed-value]").value = memory.speed;
      box.querySelector("[data-auto-speed-value]").textContent = memory.speed;
    };
    box
      .querySelectorAll("[data-auto-pause], [data-auto-minimize], [data-auto-close]")
      .forEach((button) =>
        button.addEventListener("pointerdown", (event) => event.stopPropagation()),
      );
    box.querySelector("[data-auto-pause]").onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      globalThis.toggleAutoBotPause?.();
      syncPauseButton();
      log(memory.isPaused ? "Đã tạm dừng" : "Đã tiếp tục");
    };
    box.querySelector("[data-auto-close]").onclick = () => {
      stop("Đã dừng theo yêu cầu");
      box.remove();
      notifyPanel(false);
    };
    box.querySelector("[data-auto-minimize]").onclick = () => {
      box.dataset.minimized = "true";
      box.style.width = "42px";
      box.style.height = "42px";
      box.style.minWidth = "0";
      box.style.minHeight = "0";
      box.style.maxWidth = "none";
      box.style.maxHeight = "none";
      box.style.resize = "none";
      box.style.overflow = "visible";
      box.style.border = "0";
      box.style.borderRadius = "50%";
      box.style.padding = "0";
      box.style.boxShadow = "none";
      box.innerHTML =
        '<button data-auto-restore aria-label="Mở dashboard" title="Mở dashboard" style="display:grid;place-items:center;width:42px;height:42px;padding:0;border:1px solid var(--xra-border);border-radius:50%;background:var(--xra-bg);color:var(--xra-color);font-size:20px;line-height:1;cursor:pointer">↗</button><span data-auto-mini-badge style="position:absolute;right:-8px;top:-9px;display:flex;align-items:stretch;overflow:hidden;border:1px solid var(--xra-border);border-radius:999px;background:var(--xra-bg);box-shadow:0 2px 7px #0008;color:#fff;font:700 9px/1 system-ui;white-space:nowrap"><span data-auto-mini-rate style="padding:3px 4px;background:#168bd1;color:#fff">0/p</span><span data-auto-mini-done style="padding:3px 4px;background:#129b78;color:#fff">0</span><span data-auto-mini-skipped style="padding:3px 4px;background:#d84252;color:#fff">0</span></span>';
      dashboard();
      makeDraggable(box.querySelector("[data-auto-restore]"));
      box.querySelector("[data-auto-restore]").onclick = (event) => {
        const restore = box.querySelector("[data-auto-restore]");
        if (event.detail > 1 || restore?.dataset.autoDragMoved === "true") {
          if (restore) restore.dataset.autoDragMoved = "false";
          event.preventDefault();
          return;
        }
        const left = box.style.left,
          top = box.style.top;
        box.remove();
        const restored = dashboardView();
        restored.style.left = left;
        restored.style.top = top;
        restored.style.right = "auto";
        dashboard();
      };
    };
    return box;
  }
  function stop(reason = "Đã dừng") {
    running = false;
    memory.isPaused = false;
    memory.isAutoResting = false;
    memory.autoRestUntil = 0;
    activeRunSegmentStartedAt = 0;
    globalThis.__assistantAutoFlowRunning = false;
    document.dispatchEvent(new Event("assistant-auto-flow-state"));
    memory.runState = "stopped";
    clearTimeout(timer);
    log(reason);
    dashboard();
    notifyPanel(false);
  }
  async function loop() {
    if (!running) return;
    if (/^\/compose\/post(?:\/|$)/i.test(location.pathname)) {
      stop("Đã dừng: phát hiện trình soạn thảo X");
      return;
    }
    if (!(await waitIfPaused())) return;
    if (!location.href.includes("/home") && location.pathname !== "/") {
      stop("Đã dừng: không còn ở trang Home");
      return;
    }
    const p = read(processedKey),
      s = read(skippedKey),
      done = new Set([...p, ...s].map((x) => x.id)),
      me = own(),
      excludedAuthors = await excludedAuthorSet();
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      if (
        article.querySelector(
          '[data-testid="placementTracking"], [data-testid="placementTracking"]',
        ) ||
        /được quảng bá|promoted/i.test(article.textContent || "")
      )
        continue;
      const id = postId(article),
        link = article.querySelector('a[href*="/status/"]'),
        author = link?.href.match(/x\.com\/([^/]+)\/status/)?.[1]?.toLowerCase();
      const authorText =
        article
          .querySelector('[data-testid="User-Name"]')
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ||
        author ||
        "unknown";
      const displayName = authorText.split("@")[0].trim() || authorText;
      if (!id || done.has(id) || author === me) continue;
      if (author && excludedAuthors.has(author)) {
        s.push({
          id,
          url: link.href,
          handle: author,
          displayName,
          reason: "Tài khoản trong danh sách bỏ qua",
        });
        done.add(id);
        save(skippedKey, s);
        log(`Bỏ qua @${author}: nằm trong danh sách tài khoản loại trừ`);
        dashboard();
        continue;
      }
      const onlyVietnamese = document.querySelector("[data-auto-vietnamese]")?.checked !== false;
      if (onlyVietnamese && !isVietnamesePost(article)) continue;
      clearCurrentProcessing();
      const item = { id, url: link.href, handle: author || "unknown", displayName };
      log(`Bài viết của: ${displayName} - ${author ? "@" + author : "unknown"} | ID: ${id}`);
      if (!(await waitIfPaused())) return;
      link?.click();
      let opened = false;
      for (let wait = 0; wait < 20; wait++) {
        await pauseSleep(500);
        if (location.pathname.includes("/status/")) {
          opened = true;
          break;
        }
      }
      if (!opened) {
        s.push({ ...item, reason: "Không mở được bài viết" });
        save(skippedKey, s);
        log("Bỏ qua:", id, "Không mở được bài viết");
        clearCurrentProcessing();
        continue;
      }
      await pauseSleep(2000);
      if ((await excludedAuthorSet()).has(item.handle)) {
        s.push({ ...item, reason: "Tài khoản trong danh sách bỏ qua" });
        save(skippedKey, s);
        log(
          `Đã mở bài của @${item.handle} nhưng tài khoản nằm trong danh sách bỏ qua · quay về Home`,
        );
        await returnHome();
        clearCurrentProcessing();
        dashboard();
        break;
      }
      // The assistant toolbar is mounted near the reply composer. Do not
      // advance the whole X page while waiting for it; that can run to the
      // bottom of a long conversation when the toolbar is unavailable.
      let replyComposer = document.querySelector(
        '[data-testid="tweetTextarea_0_label"], [data-testid^="tweetTextarea_"]',
      );
      if (!(await waitIfPaused())) return;
      if (!replyComposer) {
        // On a status page X may not mount the inline composer until its
        // native Reply action is opened. Scope the click to this post so it
        // cannot trigger the global compose flow.
        const targetArticle = [...document.querySelectorAll('article[data-testid="tweet"]')].find(
          (candidate) =>
            [...candidate.querySelectorAll('a[href*="/status/"]')].some((anchor) =>
              new RegExp(`/status/${id}(?:$|[?#/])`).test(anchor.href),
            ),
        );
        const nativeReply = targetArticle?.querySelector('[data-testid="reply"]');
        if (nativeReply && !nativeReply.dataset.xraOpened) {
          nativeReply.dataset.xraOpened = "1";
          nativeReply.click();
          log("Đã mở ô Trả lời của bài viết");
        }
        for (let composerWait = 0; composerWait < 20; composerWait++) {
          replyComposer = document.querySelector(
            '[data-testid="tweetTextarea_0_label"], [data-testid^="tweetTextarea_"]',
          );
          if (replyComposer) break;
          await pauseSleep(300);
        }
      }
      replyComposer?.scrollIntoView({ behavior: "auto", block: "center" });
      let replyButton = null;
      for (let toolbarWait = 0; toolbarWait < 20; toolbarWait++) {
        replyButton = document.querySelector(".xra-button.xra-generate,.xra-button.xra-sync");
        if (replyButton) {
          if (!(await waitIfPaused())) return;
          replyButton.scrollIntoView({ behavior: "auto", block: "center" });
          break;
        }
        await pauseSleep(500);
      }
      await pauseSleep(900);
      if (!replyButton) {
        const reason = "Không tải được giao diện trợ lý sau khi mở bài";
        log(`Lỗi: ${reason}`);
        await coordinate("release", item);
        s.push({ ...item, reason });
        save(skippedKey, s);
        await returnHome();
        clearCurrentProcessing();
        dashboard();
        break;
      }
      const currentDone = new Set(
        [...read(processedKey), ...read(skippedKey)].map((entry) => entry.id),
      );
      const myHandle = own();
      if (currentDone.has(id) || domHasOwnReply(myHandle)) {
        log("Trạng thái: Đã trả lời -> Skip");
        s.push({ ...item, reason: "Đã có reply hoặc đã xử lý" });
        save(skippedKey, s);
        await returnHome();
        clearCurrentProcessing();
        dashboard();
        break;
      }
      const claim = await coordinate("claim", item);
      if (!claim.granted) {
        log(`Bỏ qua: bài đang được tab khác xử lý (${id})`);
        await returnHome();
        clearCurrentProcessing();
        dashboard();
        break;
      }
      if (claim.waitMs) {
        log(
          `Đã nhận bài · chờ ${Math.ceil(claim.waitMs / 1000)} giây để tránh gửi trùng thời điểm`,
        );
        await pauseSleep(claim.waitMs);
      }
      log("Trạng thái: Chưa trả lời");
      let button = null;
      let buttonWait = 0;
      while (running && buttonWait < 60) {
        button = document.querySelector(".xra-button.xra-generate,.xra-button.xra-sync");
        if (button && !button.disabled) break;
        // Do not click X's native Reply button here: that opens the global
        // compose dialog and steals the target article from the assistant.
        // Wait for the assistant content UI to mount instead.
        buttonWait += 1;
        await pauseSleep(flowDelay(700));
      }
      if (!running) {
        await coordinate("release", item);
        return;
      }
      if (!button || button.disabled) {
        const reason = "Giao diện trợ lý không sẵn sàng sau khi chờ";
        log(`Lỗi: ${reason}`);
        await coordinate("release", item);
        s.push({ ...item, reason });
        save(skippedKey, s);
        await returnHome();
        clearCurrentProcessing();
        dashboard();
        break;
      }
      if (button && !button.disabled) {
        if (!(await waitIfPaused())) {
          await coordinate("release", item);
          return;
        }
        let suggestion = document.querySelector(".xra-results .xra-suggestion-wrap .xra-chip-main");
        let providerError = "";
        if (suggestion) {
          log("Đã có gợi ý sẵn · dùng lại, không gọi gợi ý lần hai");
        } else {
          globalThis.__assistantAutoFlowRequest = true;
          try {
            button.click();
          } finally {
            globalThis.__assistantAutoFlowRequest = false;
          }
          console.log("[Assistant Auto] Status: Normal (đã yêu cầu tạo gợi ý)");
          while (running && !suggestion) {
            await pauseSleep(flowDelay(700));
            suggestion = document.querySelector(".xra-results .xra-suggestion-wrap .xra-chip-main");
            const errorNode = document.querySelector(".xra-error,[role=alert],.xra-status-error");
            providerError = errorNode?.textContent?.trim() || "";
            if (providerError) break;
          }
        }
        if (providerError) {
          const retryButton = document.querySelector(
            ".xra-button.xra-sync,.xra-button.xra-generate",
          );
          if (retryButton && running) {
            log("Lỗi gợi ý -> Tạo lại gợi ý");
            if (!(await waitIfPaused())) {
              await coordinate("release", item);
              return;
            }
            globalThis.__assistantAutoFlowRequest = true;
            try {
              retryButton.click();
            } finally {
              globalThis.__assistantAutoFlowRequest = false;
            }
            providerError = "";
            for (let retryWait = 0; retryWait < 60 && running; retryWait++) {
              await pauseSleep(flowDelay(500));
              const retryError =
                document
                  .querySelector(".xra-error,[role=alert],.xra-status-error")
                  ?.textContent?.trim() || "";
              const retrySuggestion = document.querySelector(
                ".xra-results .xra-suggestion-wrap .xra-chip-main",
              );
              if (retrySuggestion) {
                suggestion = retrySuggestion;
                break;
              }
              if (retryError) {
                providerError = retryError;
                break;
              }
            }
          }
        }
        if (providerError) {
          await coordinate("release", item);
          memory.consecutiveFailures += 1;
          memory.sessionFailures += 1;
          s.push({ ...item, reason: providerError });
          save(skippedKey, s);
          log(
            `Lỗi gợi ý (${memory.sessionFailures}/5 phiên, ${memory.consecutiveFailures}/3 liên tiếp):`,
            providerError,
          );
          await returnHome();
          clearCurrentProcessing();
          if (memory.sessionFailures > 5 || memory.consecutiveFailures >= 3) {
            stop("Đã dừng: 3 bài liên tiếp không trả lời được");
            return;
          }
          dashboard();
          break;
        }
        if (suggestion) {
          const suggestions = Array.from(
              document.querySelectorAll(".xra-results .xra-suggestion-wrap"),
            ),
            preferredSuggestions =
              globalThis.AutoReplySelection?.preferAboveScore(suggestions, 30) || suggestions;
          log("Kết quả gợi ý: " + suggestions.length);
          if (preferredSuggestions.length < suggestions.length)
            log(`Ưu tiên câu trên 30% (${preferredSuggestions.length}/${suggestions.length})`);
          else if (
            suggestions.length &&
            !suggestions.some((item) => Number(item.dataset.relevanceScore) > 30)
          )
            log("Không có câu trên 30% · dùng danh sách hiện có");
          const chosen = Math.floor(Math.random() * preferredSuggestions.length);
          log("Lựa chọn: " + (chosen + 1));
          suggestion = preferredSuggestions[chosen]?.querySelector(".xra-chip-main") || suggestion;
          const submitSlot = await coordinate("commit", item);
          if (!submitSlot.granted) {
            log(`Không thể nhận slot gửi comment: ${submitSlot.reason || "lease hết hạn"}`);
            await coordinate("release", item);
            await returnHome();
            clearCurrentProcessing();
            dashboard();
            break;
          }
          if (submitSlot.waitMs) {
            log(
              `Chờ ${Math.ceil(submitSlot.waitMs / 1000)} giây để giãn thời gian comment (mức ${memory.speed || 0})`,
            );
            await pauseSleep(submitSlot.waitMs);
          }
          if (!(await waitIfPaused())) {
            await coordinate("release", item);
            return;
          }
          const selectedReply =
            suggestion.querySelector(":scope > span:first-child")?.textContent?.trim() ||
            suggestion.textContent?.trim() ||
            "";
          suggestion.click();
          const submitted = await submitSelectedReply(selectedReply, myHandle);
          if (!submitted) {
            const reason = "Không xác nhận được nút Trả lời sau khi chọn gợi ý";
            log(`Lỗi: ${reason}`);
            await coordinate("release", item);
            s.push({ ...item, reason });
            save(skippedKey, s);
            await returnHome();
            clearCurrentProcessing();
            dashboard();
            break;
          }
          await coordinate("release", item);
          memory.consecutiveFailures = 0;
          p.push({ ...item, completedAt: Date.now() });
          save(processedKey, p);
          log("Hoàn thành [Total done: " + p.length + " | Total skip: " + s.length + "]");
          await pauseSleep(1800);
        }
      }
      await coordinate("release", item);
      dashboard();
      console.log("[Assistant Auto] Đang quay về Home để chuyển bài tiếp theo");
      const returnedHome = await returnHome();
      if (!returnedHome)
        console.warn("[Assistant Auto] Cảnh báo: chưa xác nhận được Home, tiếp tục kiểm tra lại");
      clearCurrentProcessing();
      dashboard();
      await pauseSleep(flowDelay(1200));
      break;
    }
    if (running) {
      if (!(await waitIfPaused())) return;
      window.scrollBy({ top: 450, behavior: "smooth" });
      if (running && !memory.isPaused) timer = setTimeout(loop, flowDelay(2200));
    }
  }
  const resumeCurrentRun = () => {
    if (running) {
      setPaused(false);
      return;
    }
    if (!memory.isPaused || memory.runState !== "paused") return;
    memory.runId ||= createRunId();
    memory.runStartedAt ||= Date.now();
    sessionStart = Number(memory.runStartedAt) || Date.now();
    processedKey = runStorageKey(memory.runId, "processed");
    skippedKey = runStorageKey(memory.runId, "skipped");
    memory.processed = read(processedKey);
    memory.skipped = read(skippedKey);
    activeRunSegmentStartedAt = memory.isAutoResting ? 0 : Date.now();
    memory.isPaused = false;
    memory.runState = "running";
    running = true;
    globalThis.__assistantAutoFlowRunning = true;
    document.dispatchEvent(new Event("assistant-auto-flow-state"));
    syncPauseButton();
    log("Tiếp tục phiên hiện tại · giữ nguyên số liệu");
    dashboard();
    notifyPanel(true);
    sendRuntimeMessage({
      type: "autoFlowPauseState",
      paused: false,
      runId: memory.runId,
    });
    (async () => {
      if (!location.href.includes("/home") && location.pathname !== "/") {
        log("Đang chuyển về Home để tiếp tục phiên");
        await returnHome();
      }
      await loop();
    })().catch((error) => {
      log("Lỗi khi tiếp tục:", error);
      stop("Đã dừng do lỗi khi tiếp tục");
    });
  };
  try {
    chrome.runtime.onMessage.addListener((m, _s, send) => {
      if (m?.type === "autoFlowIdentity") {
        send({
          ok: true,
          runId: memory.runId || null,
          enabled: !!memory.runState && memory.runState !== "idle",
          running,
          paused: !!memory.isPaused,
          account: own(),
          url: location.href,
        });
        return false;
      }
      if (m?.type !== "autoReplyFlow") return;
      stop("Đã reset phiên");
      if (m.enabled) {
        sessionStart = Date.now();
        memory.autoRestEnabled = localStorage.getItem("assistantAutoRestEnabled") === "true";
        memory.autoRestEveryMinutes = Math.max(
          1,
          Math.min(1440, Number(localStorage.getItem("assistantAutoRestEveryMinutes")) || 30),
        );
        memory.runId = createRunId();
        memory.runStartedAt = sessionStart;
        memory.runState = "running";
        memory.isPaused = false;
        memory.isAutoResting = false;
        memory.autoRestUntil = 0;
        activeRunElapsedMs = 0;
        activeRunSegmentStartedAt = sessionStart;
        processedKey = runStorageKey(memory.runId, "processed");
        skippedKey = runStorageKey(memory.runId, "skipped");
        memory.sessionFailures = 0;
        memory.consecutiveFailures = 0;
        memory.processed = [];
        memory.skipped = [];
        memory.logs = [];
        save(processedKey, []);
        save(skippedKey, []);
        running = true;
        globalThis.__assistantAutoFlowRunning = true;
        document.dispatchEvent(new Event("assistant-auto-flow-state"));
        notifyPanel(true);
        log(`Bắt đầu phiên tự động · ID ${memory.runId}`);
        dashboardView();
        dashboard();
        (async () => {
          if (!location.href.includes("/home") && location.pathname !== "/") {
            const currentAuthor = location.pathname
                .match(/^\/([^/]+)\/status\//i)?.[1]
                ?.toLowerCase(),
              excluded = await excludedAuthorSet();
            log(
              currentAuthor && excluded.has(currentAuthor)
                ? `Bài của @${currentAuthor} nằm trong danh sách bỏ qua · chuyển về Home`
                : "Đang chuyển về Home (click 2 lần)",
            );
            const home = document.querySelector("a[data-testid=AppTabBar_Home_Link]");
            home?.click();
            await pauseSleep(700);
            home?.click();
            await pauseSleep(4000);
          }
          loop().catch((e) => {
            log("Lỗi:", e);
            stop("Đã dừng do lỗi");
          });
        })();
      }
      send({ ok: true });
      return false;
    });
  } catch (error) {
    if (!isInvalidatedContext(error)) throw error;
  }
  sendRuntimeMessage({ type: "autoFlowReady" });
})();
